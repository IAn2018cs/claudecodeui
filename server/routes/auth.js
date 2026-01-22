import express from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { userDb, db } from '../database/db.js';
import { generateToken, authenticateToken } from '../middleware/auth.js';
import { initUserDirectories } from '../services/user-directories.js';

const router = express.Router();

// Check auth status and setup requirements
router.get('/status', async (req, res) => {
  try {
    const hasUsers = await userDb.hasUsers();
    res.json({ 
      needsSetup: !hasUsers,
      isAuthenticated: false // Will be overridden by frontend if token exists
    });
  } catch (error) {
    console.error('Auth status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User registration - first user becomes admin
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username.length < 3 || password.length < 6) {
      return res.status(400).json({
        error: 'Username must be at least 3 characters, password at least 6 characters'
      });
    }

    // Check if this is the first user (becomes admin)
    const userCount = userDb.getUserCount();
    const role = userCount === 0 ? 'admin' : 'user';
    const uuid = uuidv4();

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user with full details
    const user = userDb.createUserFull(username, passwordHash, uuid, role);

    // Initialize user directories (creates .claude.json with hasCompletedOnboarding=true)
    await initUserDirectories(uuid);

    // Generate token
    const token = generateToken(user);

    // Update last login
    userDb.updateLastLogin(user.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        uuid: user.uuid,
        role: user.role
      },
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// User login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = userDb.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Check if user is disabled
    if (user.status === 'disabled') {
      return res.status(403).json({ error: 'Account has been disabled' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = generateToken(user);
    userDb.updateLastLogin(user.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
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
      username: req.user.username,
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

export default router;