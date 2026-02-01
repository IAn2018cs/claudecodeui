import express from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { userDb, verificationDb, domainWhitelistDb, usageDb } from '../database/db.js';
import { generateToken, authenticateToken } from '../middleware/auth.js';
import { initUserDirectories } from '../services/user-directories.js';
import { sendVerificationCode, isSmtpConfigured } from '../services/email.js';

const router = express.Router();

// Check auth status and setup requirements
router.get('/status', async (req, res) => {
  try {
    const hasUsers = await userDb.hasUsers();
    res.json({
      needsSetup: !hasUsers,
      isAuthenticated: false, // Will be overridden by frontend if token exists
      smtpConfigured: isSmtpConfigured()
    });
  } catch (error) {
    console.error('Auth status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send verification code to email
router.post('/send-code', async (req, res) => {
  try {
    const { email } = req.body;
    const ipAddress = req.ip || req.socket?.remoteAddress;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ error: '请输入有效的邮箱地址' });
    }

    // Check if SMTP is configured
    if (!isSmtpConfigured()) {
      return res.status(500).json({ error: 'SMTP 未配置，请联系管理员' });
    }

    // Check rate limit
    const rateCheck = verificationDb.canSendCode(email);
    if (!rateCheck.allowed) {
      if (rateCheck.error === 'rate_limit_email') {
        return res.status(429).json({
          error: '发送过于频繁，请稍后再试',
          waitSeconds: rateCheck.waitSeconds
        });
      }
      return res.status(429).json({ error: '今日发送次数已达上限' });
    }

    // Determine if this is login or registration
    const existingUser = userDb.getUserByEmail(email);
    const type = existingUser ? 'login' : 'register';

    // For new registrations, check domain whitelist
    if (type === 'register') {
      if (!domainWhitelistDb.isEmailAllowed(email)) {
        return res.status(403).json({ error: '该邮箱域名不在允许注册的列表中' });
      }
    }

    // Generate and store code
    const { code } = verificationDb.createCode(email, type, ipAddress);

    // Send email
    await sendVerificationCode(email, code);

    res.json({
      success: true,
      type, // 'login' or 'register' - frontend can show appropriate message
      message: '验证码已发送'
    });

  } catch (error) {
    console.error('Send code error:', error);
    res.status(500).json({ error: '发送验证码失败，请稍后再试' });
  }
});

// Verify code and login/register
router.post('/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: '邮箱和验证码不能为空' });
    }

    // Verify the code
    const verification = verificationDb.verifyCode(email, code);

    if (!verification.valid) {
      // Increment attempts for failed verification
      verificationDb.incrementAttempts(email, code);

      if (verification.error === 'max_attempts') {
        return res.status(429).json({ error: '验证码尝试次数过多，请重新获取' });
      }
      return res.status(401).json({ error: '验证码无效或已过期' });
    }

    let user = userDb.getUserByEmail(email);

    // If user doesn't exist, create new user (registration)
    if (!user) {
      const userCount = userDb.getUserCount();
      const role = userCount === 0 ? 'admin' : 'user';
      const uuid = uuidv4();

      user = userDb.createUserWithEmail(email, uuid, role);

      // Initialize user directories
      await initUserDirectories(uuid);
    }

    // Check if user is disabled
    if (user.status === 'disabled') {
      return res.status(403).json({ error: '账户已被禁用' });
    }

    // Generate token with 30-day expiration
    const token = generateToken(user);

    // Update last login
    userDb.updateLastLogin(user.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username || user.email,
        uuid: user.uuid,
        role: user.role
      },
      token
    });

  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User login with username/password (for admin-created accounts)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const user = userDb.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // Check if user has a password (admin-created account)
    if (!user.password_hash) {
      return res.status(401).json({ error: '此账户不支持密码登录' });
    }

    // Check if user is disabled
    if (user.status === 'disabled') {
      return res.status(403).json({ error: '账户已被禁用' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = generateToken(user);
    userDb.updateLastLogin(user.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        uuid: user.uuid,
        role: user.role
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user (protected route)
router.get('/user', authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username || req.user.email,
      email: req.user.email,
      uuid: req.user.uuid,
      role: req.user.role
    }
  });
});

// Logout (client-side token removal, but this endpoint can be used for logging)
router.post('/logout', authenticateToken, (req, res) => {
  // In a simple JWT system, logout is mainly client-side
  // This endpoint exists for consistency and potential future logging
  res.json({ success: true, message: 'Logged out successfully' });
});

// Get current user's spending limit status
router.get('/limit-status', authenticateToken, (req, res) => {
  try {
    const status = usageDb.checkUserLimits(req.user.uuid);
    res.json(status);
  } catch (error) {
    console.error('Error checking limit status:', error);
    res.status(500).json({ error: '获取限制状态失败' });
  }
});

export default router;
