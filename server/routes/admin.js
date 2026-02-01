import express from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { userDb, domainWhitelistDb } from '../database/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { deleteUserDirectories, initUserDirectories } from '../services/user-directories.js';

const router = express.Router();

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Apply auth and admin middleware to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// Get all users
router.get('/users', (req, res) => {
  try {
    const users = userDb.getAllUsers();
    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create a new user with username and password (admin only)
router.post('/users', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    if (username.length < 3 || password.length < 6) {
      return res.status(400).json({
        error: '用户名至少3个字符，密码至少6个字符'
      });
    }

    // Check if username already exists
    const existingUser = userDb.getUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({ error: '用户名已存在' });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const uuid = uuidv4();
    const user = userDb.createUserFull(username, passwordHash, uuid, 'user');

    // Initialize user directories
    await initUserDirectories(uuid);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        uuid: user.uuid,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Error creating user:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: '用户名已存在' });
    } else {
      res.status(500).json({ error: '创建用户失败' });
    }
  }
});

// Update user status
router.patch('/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'disabled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Prevent self-disable
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot modify your own status' });
    }

    const user = userDb.getUserById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    userDb.updateUserStatus(id, status);
    res.json({ success: true, message: `User status updated to ${status}` });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-delete
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = userDb.getUserById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user directories
    if (user.uuid) {
      await deleteUserDirectories(user.uuid);
    }

    // Delete from database
    userDb.deleteUserById(id);

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ==================== User Spending Limits ====================

// Get user spending limits
router.get('/users/:id/limits', (req, res) => {
  try {
    const { id } = req.params;

    const user = userDb.getUserById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const limits = userDb.getUserLimits(id);
    res.json({
      total_limit_usd: limits?.total_limit_usd ?? null,
      daily_limit_usd: limits?.daily_limit_usd ?? null
    });
  } catch (error) {
    console.error('Error fetching user limits:', error);
    res.status(500).json({ error: '获取用户限制失败' });
  }
});

// Update user spending limits
router.patch('/users/:id/limits', (req, res) => {
  try {
    const { id } = req.params;
    const { total_limit_usd, daily_limit_usd } = req.body;

    // Validate limits - allow null or positive numbers
    if (total_limit_usd !== null && total_limit_usd !== undefined) {
      if (typeof total_limit_usd !== 'number' || total_limit_usd < 0) {
        return res.status(400).json({ error: '总额度限制必须是正数或为空' });
      }
    }
    if (daily_limit_usd !== null && daily_limit_usd !== undefined) {
      if (typeof daily_limit_usd !== 'number' || daily_limit_usd < 0) {
        return res.status(400).json({ error: '每日额度限制必须是正数或为空' });
      }
    }

    // Prevent modifying own limits
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: '不能修改自己的额度限制' });
    }

    const user = userDb.getUserById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Convert undefined to null for database
    const totalLimit = total_limit_usd === undefined ? null : total_limit_usd;
    const dailyLimit = daily_limit_usd === undefined ? null : daily_limit_usd;

    userDb.updateUserLimits(id, totalLimit, dailyLimit);
    res.json({
      success: true,
      message: '用户额度限制已更新',
      limits: {
        total_limit_usd: totalLimit,
        daily_limit_usd: dailyLimit
      }
    });
  } catch (error) {
    console.error('Error updating user limits:', error);
    res.status(500).json({ error: '更新用户限制失败' });
  }
});

// ==================== Email Domain Whitelist ====================

// Get all whitelisted domains
router.get('/email-domains', (req, res) => {
  try {
    const domains = domainWhitelistDb.getAllDomains();
    res.json({ domains });
  } catch (error) {
    console.error('Error fetching email domains:', error);
    res.status(500).json({ error: '获取域名列表失败' });
  }
});

// Add a domain to whitelist
router.post('/email-domains', (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ error: '域名不能为空' });
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return res.status(400).json({ error: '域名格式无效' });
    }

    const result = domainWhitelistDb.addDomain(domain, req.user.id);
    res.json({ success: true, domain: result });
  } catch (error) {
    console.error('Error adding email domain:', error);
    if (error.message === '域名已存在') {
      res.status(409).json({ error: error.message });
    } else {
      res.status(500).json({ error: '添加域名失败' });
    }
  }
});

// Remove a domain from whitelist
router.delete('/email-domains/:id', (req, res) => {
  try {
    const { id } = req.params;
    const success = domainWhitelistDb.removeDomain(parseInt(id));

    if (success) {
      res.json({ success: true, message: '域名已删除' });
    } else {
      res.status(404).json({ error: '域名不存在' });
    }
  } catch (error) {
    console.error('Error removing email domain:', error);
    res.status(500).json({ error: '删除域名失败' });
  }
});

export default router;
