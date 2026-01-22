import express from 'express';
import { userDb } from '../database/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { deleteUserDirectories } from '../services/user-directories.js';

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

export default router;
