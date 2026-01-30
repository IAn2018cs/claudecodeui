import express from 'express';
import { userDb, usageDb } from '../database/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { triggerManualScan } from '../services/usage-scanner.js';

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

/**
 * Get usage summary for all users
 * Used in the user list page to show cost per user
 */
router.get('/summary', (req, res) => {
  try {
    const usageSummary = usageDb.getAllUsersSummary();
    const users = userDb.getAllUsers();

    // Create a map of uuid to user info
    const userMap = {};
    for (const user of users) {
      userMap[user.uuid] = {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status
      };
    }

    // Merge usage data with user info
    const result = usageSummary.map(usage => ({
      ...usage,
      ...userMap[usage.user_uuid]
    }));

    // Add users with no usage
    for (const user of users) {
      if (!usageSummary.find(u => u.user_uuid === user.uuid)) {
        result.push({
          user_uuid: user.uuid,
          id: user.id,
          username: user.username,
          role: user.role,
          status: user.status,
          total_cost: 0,
          total_requests: 0,
          total_sessions: 0,
          last_active: null
        });
      }
    }

    res.json({ users: result });
  } catch (error) {
    console.error('Error fetching usage summary:', error);
    res.status(500).json({ error: 'Failed to fetch usage summary' });
  }
});

/**
 * Get detailed usage for a specific user
 */
router.get('/users/:uuid', (req, res) => {
  try {
    const { uuid } = req.params;
    const { period = 'week' } = req.query;

    // Validate user exists
    const user = userDb.getUserByUuid(uuid);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate date range
    const endDate = new Date().toISOString().split('T')[0];
    let startDate;

    switch (period) {
      case 'week':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case 'month':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case 'all':
        startDate = '2020-01-01';
        break;
      default:
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }

    // Get usage data
    const dailyUsage = usageDb.getUserUsageByPeriod(uuid, startDate, endDate);
    const totalUsage = usageDb.getUserTotalUsage(uuid);
    const modelDistribution = usageDb.getUserModelDistribution(uuid, startDate, endDate);

    // Aggregate daily data
    const dailyMap = {};
    for (const record of dailyUsage) {
      if (!dailyMap[record.date]) {
        dailyMap[record.date] = { date: record.date, cost: 0, requests: 0 };
      }
      dailyMap[record.date].cost += record.total_cost_usd;
      dailyMap[record.date].requests += record.request_count;
    }
    const dailyTrend = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      user: {
        uuid: user.uuid,
        username: user.username,
        role: user.role
      },
      period,
      totalCost: totalUsage?.total_cost || 0,
      totalRequests: totalUsage?.total_requests || 0,
      totalSessions: totalUsage?.total_sessions || 0,
      dailyTrend,
      modelDistribution
    });
  } catch (error) {
    console.error('Error fetching user usage:', error);
    res.status(500).json({ error: 'Failed to fetch user usage' });
  }
});

/**
 * Get global dashboard statistics
 */
router.get('/dashboard', (req, res) => {
  try {
    const { period = 'week' } = req.query;

    // Calculate date range
    const endDate = new Date().toISOString().split('T')[0];
    let startDate;

    switch (period) {
      case 'week':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case 'month':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      default:
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }

    const stats = usageDb.getDashboardStats(startDate, endDate);
    const users = userDb.getAllUsers();

    // Create username map (prefer username, fallback to email)
    const usernameMap = {};
    for (const user of users) {
      usernameMap[user.uuid] = user.username || user.email;
    }

    // Enrich top users with usernames
    const topUsers = stats.topUsers.map(user => ({
      ...user,
      username: usernameMap[user.user_uuid] || 'Unknown'
    }));

    res.json({
      period,
      totals: {
        totalCost: stats.totals?.total_cost || 0,
        totalRequests: stats.totals?.total_requests || 0,
        totalSessions: stats.totals?.total_sessions || 0,
        activeUsers: stats.totals?.active_users || 0,
        totalUsers: users.length
      },
      dailyTrend: stats.dailyTrend,
      modelDistribution: stats.modelDistribution,
      topUsers
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

/**
 * Trigger a manual usage scan
 */
router.post('/scan', async (req, res) => {
  try {
    const result = await triggerManualScan();
    res.json(result);
  } catch (error) {
    console.error('Error triggering manual scan:', error);
    res.status(500).json({ error: 'Failed to trigger scan' });
  }
});

export default router;
