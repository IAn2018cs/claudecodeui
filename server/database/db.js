import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
};

const c = {
    info: (text) => `${colors.cyan}${text}${colors.reset}`,
    bright: (text) => `${colors.bright}${text}${colors.reset}`,
    dim: (text) => `${colors.dim}${text}${colors.reset}`,
};

// Use DATABASE_PATH environment variable if set, otherwise use DATA_DIR/auth.db
// DATA_DIR defaults to ./data relative to project root
const PROJECT_ROOT = path.join(__dirname, '../..');
const DATA_DIR = process.env.DATA_DIR || path.join(PROJECT_ROOT, 'data');
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(PROJECT_ROOT, process.env.DATABASE_PATH)
  : path.join(DATA_DIR, 'auth.db');
const INIT_SQL_PATH = path.join(__dirname, 'init.sql');

// Ensure database directory exists
const dbDir = path.dirname(DB_PATH);
try {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`Created database directory: ${dbDir}`);
  }
} catch (error) {
  console.error(`Failed to create database directory ${dbDir}:`, error.message);
  throw error;
}

// Create database connection
const db = new Database(DB_PATH);

// Show app installation path prominently
const appInstallPath = path.join(__dirname, '../..');
console.log('');
console.log(c.dim('═'.repeat(60)));
console.log(`${c.info('[INFO]')} App Installation: ${c.bright(appInstallPath)}`);
console.log(`${c.info('[INFO]')} Data Directory: ${c.dim(path.relative(appInstallPath, DATA_DIR))}`);
console.log(`${c.info('[INFO]')} Database: ${c.dim(path.relative(appInstallPath, DB_PATH))}`);
if (process.env.DATABASE_PATH) {
  console.log(`       ${c.dim('(Using custom DATABASE_PATH from environment)')}`);
}
console.log(c.dim('═'.repeat(60)));
console.log('');

const runMigrations = () => {
  try {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all();
    const columnNames = tableInfo.map(col => col.name);

    // Create verification_codes table for email login
    db.exec(`
      CREATE TABLE IF NOT EXISTS verification_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        type TEXT DEFAULT 'login' CHECK(type IN ('login', 'register')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        attempts INTEGER DEFAULT 0,
        used BOOLEAN DEFAULT 0,
        ip_address TEXT
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at)');

    // Create usage_records table for tracking token usage
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_uuid TEXT NOT NULL,
        session_id TEXT,
        model TEXT NOT NULL,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cache_read_tokens INTEGER DEFAULT 0,
        cache_creation_tokens INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        source TEXT DEFAULT 'sdk',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_usage_records_user_uuid ON usage_records(user_uuid)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_usage_records_created_at ON usage_records(created_at)');

    // Create usage_daily_summary table for aggregated stats
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage_daily_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_uuid TEXT NOT NULL,
        date TEXT NOT NULL,
        model TEXT NOT NULL,
        total_input_tokens INTEGER DEFAULT 0,
        total_output_tokens INTEGER DEFAULT 0,
        total_cost_usd REAL DEFAULT 0,
        session_count INTEGER DEFAULT 0,
        request_count INTEGER DEFAULT 0,
        UNIQUE(user_uuid, date, model)
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_usage_daily_summary_user_date ON usage_daily_summary(user_uuid, date)');

    if (!columnNames.includes('git_name')) {
      console.log('Running migration: Adding git_name column');
      db.exec('ALTER TABLE users ADD COLUMN git_name TEXT');
    }

    if (!columnNames.includes('git_email')) {
      console.log('Running migration: Adding git_email column');
      db.exec('ALTER TABLE users ADD COLUMN git_email TEXT');
    }

    if (!columnNames.includes('has_completed_onboarding')) {
      console.log('Running migration: Adding has_completed_onboarding column');
      db.exec('ALTER TABLE users ADD COLUMN has_completed_onboarding BOOLEAN DEFAULT 0');
    }

    // Add uuid column if not exists (without UNIQUE constraint - use index instead)
    if (!columnNames.includes('uuid')) {
      console.log('Running migration: Adding uuid column');
      db.exec('ALTER TABLE users ADD COLUMN uuid TEXT');
    }
    // Create unique index for uuid (safe to run even if already exists)
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid)');

    // Add role column if not exists
    if (!columnNames.includes('role')) {
      console.log('Running migration: Adding role column');
      db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
    }
    // Create index for role (safe to run even if already exists)
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)');

    // Add status column if not exists
    if (!columnNames.includes('status')) {
      console.log('Running migration: Adding status column');
      db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'");
    }
    // Create index for status (safe to run even if already exists)
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)');

    // Add email column if not exists (for email verification login)
    if (!columnNames.includes('email')) {
      console.log('Running migration: Adding email column');
      db.exec('ALTER TABLE users ADD COLUMN email TEXT');
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)');

    // Create email domain whitelist table
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_domain_whitelist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_email_domain_whitelist_domain ON email_domain_whitelist(domain)');

    // Add spending limit columns for users
    if (!columnNames.includes('total_limit_usd')) {
      console.log('Running migration: Adding total_limit_usd column');
      db.exec('ALTER TABLE users ADD COLUMN total_limit_usd REAL DEFAULT NULL');
    }

    if (!columnNames.includes('daily_limit_usd')) {
      console.log('Running migration: Adding daily_limit_usd column');
      db.exec('ALTER TABLE users ADD COLUMN daily_limit_usd REAL DEFAULT NULL');
    }

    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Error running migrations:', error.message);
    throw error;
  }
};

// Initialize database with schema
const initializeDatabase = async () => {
  try {
    const initSQL = fs.readFileSync(INIT_SQL_PATH, 'utf8');
    db.exec(initSQL);
    console.log('Database initialized successfully');
    runMigrations();
  } catch (error) {
    console.error('Error initializing database:', error.message);
    throw error;
  }
};

// User database operations
const userDb = {
  // Check if any users exist
  hasUsers: () => {
    try {
      const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
      return row.count > 0;
    } catch (err) {
      throw err;
    }
  },

  // Create a new user
  createUser: (username, passwordHash) => {
    try {
      const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
      const result = stmt.run(username, passwordHash);
      return { id: result.lastInsertRowid, username };
    } catch (err) {
      throw err;
    }
  },

  // Get user by username
  getUserByUsername: (username) => {
    try {
      const row = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
      return row;
    } catch (err) {
      throw err;
    }
  },

  // Update last login time
  updateLastLogin: (userId) => {
    try {
      db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
    } catch (err) {
      throw err;
    }
  },

  // Get user by ID
  getUserById: (userId) => {
    try {
      const row = db.prepare('SELECT id, username, uuid, role, status, created_at, last_login FROM users WHERE id = ? AND is_active = 1').get(userId);
      return row;
    } catch (err) {
      throw err;
    }
  },

  getFirstUser: () => {
    try {
      const row = db.prepare('SELECT id, username, created_at, last_login FROM users WHERE is_active = 1 LIMIT 1').get();
      return row;
    } catch (err) {
      throw err;
    }
  },

  updateGitConfig: (userId, gitName, gitEmail) => {
    try {
      const stmt = db.prepare('UPDATE users SET git_name = ?, git_email = ? WHERE id = ?');
      stmt.run(gitName, gitEmail, userId);
    } catch (err) {
      throw err;
    }
  },

  getGitConfig: (userId) => {
    try {
      const row = db.prepare('SELECT git_name, git_email FROM users WHERE id = ?').get(userId);
      return row;
    } catch (err) {
      throw err;
    }
  },

  completeOnboarding: (userId) => {
    try {
      const stmt = db.prepare('UPDATE users SET has_completed_onboarding = 1 WHERE id = ?');
      stmt.run(userId);
    } catch (err) {
      throw err;
    }
  },

  hasCompletedOnboarding: (userId) => {
    try {
      const row = db.prepare('SELECT has_completed_onboarding FROM users WHERE id = ?').get(userId);
      return row?.has_completed_onboarding === 1;
    } catch (err) {
      throw err;
    }
  },

  // Get user count
  getUserCount: () => {
    try {
      const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
      return row.count;
    } catch (err) {
      throw err;
    }
  },

  // Create user with full details
  createUserFull: (username, passwordHash, uuid, role) => {
    try {
      const stmt = db.prepare(
        'INSERT INTO users (username, password_hash, uuid, role) VALUES (?, ?, ?, ?)'
      );
      const result = stmt.run(username, passwordHash, uuid, role);
      return { id: result.lastInsertRowid, username, uuid, role };
    } catch (err) {
      throw err;
    }
  },

  // Get all users (for admin)
  getAllUsers: () => {
    try {
      return db.prepare(
        'SELECT id, username, email, uuid, role, status, created_at, last_login, total_limit_usd, daily_limit_usd FROM users ORDER BY created_at DESC'
      ).all();
    } catch (err) {
      throw err;
    }
  },

  // Update user status
  updateUserStatus: (userId, status) => {
    try {
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, userId);
    } catch (err) {
      throw err;
    }
  },

  // Delete user by ID
  deleteUserById: (userId) => {
    try {
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    } catch (err) {
      throw err;
    }
  },

  // Get user by UUID
  getUserByUuid: (uuid) => {
    try {
      return db.prepare('SELECT * FROM users WHERE uuid = ?').get(uuid);
    } catch (err) {
      throw err;
    }
  },

  // Get user by email
  getUserByEmail: (email) => {
    try {
      return db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
    } catch (err) {
      throw err;
    }
  },

  // Create user with email (for email verification login)
  createUserWithEmail: (email, uuid, role) => {
    try {
      const stmt = db.prepare(
        'INSERT INTO users (email, uuid, role) VALUES (?, ?, ?)'
      );
      const result = stmt.run(email, uuid, role);
      return { id: result.lastInsertRowid, email, uuid, role };
    } catch (err) {
      throw err;
    }
  },

  // Check if email exists
  emailExists: (email) => {
    try {
      const row = db.prepare('SELECT COUNT(*) as count FROM users WHERE email = ?').get(email);
      return row.count > 0;
    } catch (err) {
      throw err;
    }
  },

  // Update user spending limits
  updateUserLimits: (userId, totalLimit, dailyLimit) => {
    try {
      db.prepare('UPDATE users SET total_limit_usd = ?, daily_limit_usd = ? WHERE id = ?')
        .run(totalLimit, dailyLimit, userId);
    } catch (err) {
      throw err;
    }
  },

  // Get user spending limits
  getUserLimits: (userId) => {
    try {
      return db.prepare('SELECT total_limit_usd, daily_limit_usd FROM users WHERE id = ?').get(userId);
    } catch (err) {
      throw err;
    }
  },

  // Get user limits by UUID
  getUserLimitsByUuid: (uuid) => {
    try {
      return db.prepare('SELECT total_limit_usd, daily_limit_usd FROM users WHERE uuid = ?').get(uuid);
    } catch (err) {
      throw err;
    }
  }
};

// Verification codes database operations
const verificationDb = {
  // Generate and store verification code
  createCode: (email, type = 'login', ipAddress = null) => {
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

      const stmt = db.prepare(`
        INSERT INTO verification_codes (email, code, type, expires_at, ip_address)
        VALUES (?, ?, ?, ?, ?)
      `);
      const result = stmt.run(email, code, type, expiresAt, ipAddress);
      return { id: result.lastInsertRowid, code };
    } catch (err) {
      throw err;
    }
  },

  // Verify code and check if valid
  verifyCode: (email, code) => {
    try {
      const now = new Date().toISOString();

      // Find valid, unused code
      const record = db.prepare(`
        SELECT * FROM verification_codes
        WHERE email = ? AND code = ? AND used = 0 AND expires_at > ?
        ORDER BY created_at DESC LIMIT 1
      `).get(email, code, now);

      if (!record) {
        return { valid: false, error: 'invalid_code' };
      }

      if (record.attempts >= 5) {
        return { valid: false, error: 'max_attempts' };
      }

      // Mark as used
      db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(record.id);

      return { valid: true, type: record.type };
    } catch (err) {
      throw err;
    }
  },

  // Increment attempt count
  incrementAttempts: (email, code) => {
    try {
      db.prepare(`
        UPDATE verification_codes SET attempts = attempts + 1
        WHERE email = ? AND code = ? AND used = 0
      `).run(email, code);
    } catch (err) {
      throw err;
    }
  },

  // Check rate limit for sending codes
  canSendCode: (email) => {
    try {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // Check per-email rate limit (1 per minute)
      const recentByEmail = db.prepare(`
        SELECT COUNT(*) as count FROM verification_codes
        WHERE email = ? AND created_at > ?
      `).get(email, oneMinuteAgo);

      if (recentByEmail.count >= 1) {
        return { allowed: false, error: 'rate_limit_email', waitSeconds: 60 };
      }

      // Check per-email hourly limit (10 per hour)
      const hourlyByEmail = db.prepare(`
        SELECT COUNT(*) as count FROM verification_codes
        WHERE email = ? AND created_at > ?
      `).get(email, oneHourAgo);

      if (hourlyByEmail.count >= 10) {
        return { allowed: false, error: 'rate_limit_hourly' };
      }

      return { allowed: true };
    } catch (err) {
      throw err;
    }
  },

  // Cleanup expired codes
  cleanupExpired: () => {
    try {
      const now = new Date().toISOString();
      const result = db.prepare('DELETE FROM verification_codes WHERE expires_at < ?').run(now);
      return result.changes;
    } catch (err) {
      throw err;
    }
  }
};

// Usage database operations
const usageDb = {
  // Check if a usage record already exists (for deduplication)
  // Uses session_id + model + all token counts to identify duplicates within a time window
  // If session_id is null, uses user_uuid instead for matching
  checkRecordExists: (userUuid, sessionId, model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, createdAt) => {
    try {
      // Parse the timestamp and create a time window (±5 seconds to handle network delays)
      const timestamp = new Date(createdAt || Date.now());
      const windowStart = new Date(timestamp.getTime() - 5000).toISOString();
      const windowEnd = new Date(timestamp.getTime() + 5000).toISOString();

      let stmt;
      let result;

      if (sessionId) {
        // Use session_id for matching (more precise)
        stmt = db.prepare(`
          SELECT id FROM usage_records
          WHERE session_id = ?
            AND model = ?
            AND input_tokens = ?
            AND output_tokens = ?
            AND cache_read_tokens = ?
            AND cache_creation_tokens = ?
            AND created_at BETWEEN ? AND ?
          LIMIT 1
        `);
        result = stmt.get(
          sessionId, model, inputTokens, outputTokens,
          cacheReadTokens || 0, cacheCreationTokens || 0,
          windowStart, windowEnd
        );
      } else if (userUuid) {
        // Fallback to user_uuid when session_id is not available
        stmt = db.prepare(`
          SELECT id FROM usage_records
          WHERE user_uuid = ?
            AND session_id IS NULL
            AND model = ?
            AND input_tokens = ?
            AND output_tokens = ?
            AND cache_read_tokens = ?
            AND cache_creation_tokens = ?
            AND created_at BETWEEN ? AND ?
          LIMIT 1
        `);
        result = stmt.get(
          userUuid, model, inputTokens, outputTokens,
          cacheReadTokens || 0, cacheCreationTokens || 0,
          windowStart, windowEnd
        );
      } else {
        // No identifier available, cannot deduplicate
        return false;
      }

      return !!result;
    } catch (err) {
      console.error('[usageDb] Error checking record exists:', err);
      return false;
    }
  },

  // Insert a usage record
  insertRecord: (record) => {
    try {
      const stmt = db.prepare(`
        INSERT INTO usage_records (user_uuid, session_id, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost_usd, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        record.user_uuid,
        record.session_id || null,
        record.model,
        record.input_tokens || 0,
        record.output_tokens || 0,
        record.cache_read_tokens || 0,
        record.cache_creation_tokens || 0,
        record.cost_usd || 0,
        record.source || 'sdk',
        record.created_at || new Date().toISOString()
      );
      return result.lastInsertRowid;
    } catch (err) {
      throw err;
    }
  },

  // Upsert daily summary
  upsertDailySummary: (summary) => {
    try {
      const stmt = db.prepare(`
        INSERT INTO usage_daily_summary (user_uuid, date, model, total_input_tokens, total_output_tokens, total_cost_usd, session_count, request_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_uuid, date, model) DO UPDATE SET
          total_input_tokens = total_input_tokens + excluded.total_input_tokens,
          total_output_tokens = total_output_tokens + excluded.total_output_tokens,
          total_cost_usd = total_cost_usd + excluded.total_cost_usd,
          session_count = session_count + excluded.session_count,
          request_count = request_count + excluded.request_count
      `);
      stmt.run(
        summary.user_uuid,
        summary.date,
        summary.model,
        summary.total_input_tokens || 0,
        summary.total_output_tokens || 0,
        summary.total_cost_usd || 0,
        summary.session_count || 0,
        summary.request_count || 0
      );
    } catch (err) {
      throw err;
    }
  },

  // Get all users usage summary
  getAllUsersSummary: () => {
    try {
      return db.prepare(`
        SELECT
          user_uuid,
          SUM(total_cost_usd) as total_cost,
          SUM(request_count) as total_requests,
          SUM(session_count) as total_sessions,
          MAX(date) as last_active
        FROM usage_daily_summary
        GROUP BY user_uuid
        ORDER BY total_cost DESC
      `).all();
    } catch (err) {
      throw err;
    }
  },

  // Get user usage by period
  getUserUsageByPeriod: (userUuid, startDate, endDate) => {
    try {
      return db.prepare(`
        SELECT
          date,
          model,
          total_input_tokens,
          total_output_tokens,
          total_cost_usd,
          session_count,
          request_count
        FROM usage_daily_summary
        WHERE user_uuid = ? AND date >= ? AND date <= ?
        ORDER BY date DESC
      `).all(userUuid, startDate, endDate);
    } catch (err) {
      throw err;
    }
  },

  // Get user total usage
  getUserTotalUsage: (userUuid) => {
    try {
      return db.prepare(`
        SELECT
          SUM(total_cost_usd) as total_cost,
          SUM(total_input_tokens) as total_input_tokens,
          SUM(total_output_tokens) as total_output_tokens,
          SUM(request_count) as total_requests,
          SUM(session_count) as total_sessions
        FROM usage_daily_summary
        WHERE user_uuid = ?
      `).get(userUuid);
    } catch (err) {
      throw err;
    }
  },

  // Get model distribution for a user
  getUserModelDistribution: (userUuid, startDate, endDate) => {
    try {
      return db.prepare(`
        SELECT
          model,
          SUM(total_cost_usd) as cost,
          SUM(request_count) as requests
        FROM usage_daily_summary
        WHERE user_uuid = ? AND date >= ? AND date <= ?
        GROUP BY model
        ORDER BY cost DESC
      `).all(userUuid, startDate, endDate);
    } catch (err) {
      throw err;
    }
  },

  // Get global dashboard stats
  getDashboardStats: (startDate, endDate) => {
    try {
      const totals = db.prepare(`
        SELECT
          SUM(total_cost_usd) as total_cost,
          SUM(request_count) as total_requests,
          SUM(session_count) as total_sessions,
          COUNT(DISTINCT user_uuid) as active_users
        FROM usage_daily_summary
        WHERE date >= ? AND date <= ?
      `).get(startDate, endDate);

      const dailyTrend = db.prepare(`
        SELECT
          date,
          SUM(total_cost_usd) as cost,
          SUM(request_count) as requests
        FROM usage_daily_summary
        WHERE date >= ? AND date <= ?
        GROUP BY date
        ORDER BY date ASC
      `).all(startDate, endDate);

      const modelDistribution = db.prepare(`
        SELECT
          model,
          SUM(total_cost_usd) as cost,
          SUM(request_count) as requests
        FROM usage_daily_summary
        WHERE date >= ? AND date <= ?
        GROUP BY model
        ORDER BY cost DESC
      `).all(startDate, endDate);

      const topUsers = db.prepare(`
        SELECT
          user_uuid,
          SUM(total_cost_usd) as total_cost,
          SUM(request_count) as total_requests
        FROM usage_daily_summary
        WHERE date >= ? AND date <= ?
        GROUP BY user_uuid
        ORDER BY total_cost DESC
        LIMIT 10
      `).all(startDate, endDate);

      return { totals, dailyTrend, modelDistribution, topUsers };
    } catch (err) {
      throw err;
    }
  },

  // Cleanup old records (older than specified days)
  cleanupOldRecords: (days) => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffStr = cutoffDate.toISOString();

      const result = db.prepare('DELETE FROM usage_records WHERE created_at < ?').run(cutoffStr);
      return result.changes;
    } catch (err) {
      throw err;
    }
  },

  // Get user's daily usage for a specific date
  getUserDailyUsage: (userUuid, date = null) => {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];
      const result = db.prepare(`
        SELECT
          SUM(total_cost_usd) as daily_cost
        FROM usage_daily_summary
        WHERE user_uuid = ? AND date = ?
      `).get(userUuid, targetDate);
      return result?.daily_cost || 0;
    } catch (err) {
      throw err;
    }
  },

  // Check if user has exceeded spending limits
  checkUserLimits: (userUuid) => {
    try {
      // Get user's limits
      const user = db.prepare('SELECT total_limit_usd, daily_limit_usd FROM users WHERE uuid = ?').get(userUuid);
      if (!user) {
        return { allowed: true };
      }

      // Get total usage
      const totalUsage = db.prepare(`
        SELECT SUM(total_cost_usd) as total_cost
        FROM usage_daily_summary
        WHERE user_uuid = ?
      `).get(userUuid);

      // Get daily usage
      const today = new Date().toISOString().split('T')[0];
      const dailyUsage = db.prepare(`
        SELECT SUM(total_cost_usd) as daily_cost
        FROM usage_daily_summary
        WHERE user_uuid = ? AND date = ?
      `).get(userUuid, today);

      const totalCost = totalUsage?.total_cost || 0;
      const dailyCost = dailyUsage?.daily_cost || 0;

      // Check total limit first
      if (user.total_limit_usd !== null && totalCost >= user.total_limit_usd) {
        return {
          allowed: false,
          reason: 'total_limit_exceeded',
          limit: user.total_limit_usd,
          current: totalCost
        };
      }

      // Check daily limit
      if (user.daily_limit_usd !== null && dailyCost >= user.daily_limit_usd) {
        return {
          allowed: false,
          reason: 'daily_limit_exceeded',
          limit: user.daily_limit_usd,
          current: dailyCost
        };
      }

      return {
        allowed: true,
        totalCost,
        dailyCost,
        totalLimit: user.total_limit_usd,
        dailyLimit: user.daily_limit_usd
      };
    } catch (err) {
      throw err;
    }
  }
};

// Email domain whitelist database operations
const domainWhitelistDb = {
  // Get all whitelisted domains
  getAllDomains: () => {
    try {
      return db.prepare('SELECT * FROM email_domain_whitelist ORDER BY domain ASC').all();
    } catch (err) {
      throw err;
    }
  },

  // Add a domain to whitelist
  addDomain: (domain, createdBy = null) => {
    try {
      const normalizedDomain = domain.toLowerCase().trim();
      const stmt = db.prepare('INSERT INTO email_domain_whitelist (domain, created_by) VALUES (?, ?)');
      const result = stmt.run(normalizedDomain, createdBy);
      return { id: result.lastInsertRowid, domain: normalizedDomain };
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('域名已存在');
      }
      throw err;
    }
  },

  // Remove a domain from whitelist
  removeDomain: (id) => {
    try {
      const result = db.prepare('DELETE FROM email_domain_whitelist WHERE id = ?').run(id);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  },

  // Check if email domain is allowed
  isEmailAllowed: (email) => {
    try {
      // First check if whitelist is empty (allow all if no restrictions)
      const count = db.prepare('SELECT COUNT(*) as count FROM email_domain_whitelist').get();
      if (count.count === 0) {
        return true; // No whitelist configured, allow all
      }

      // Extract domain from email
      const domain = email.toLowerCase().split('@')[1];
      if (!domain) {
        return false;
      }

      // Check if domain is in whitelist
      const row = db.prepare('SELECT id FROM email_domain_whitelist WHERE domain = ?').get(domain);
      return !!row;
    } catch (err) {
      throw err;
    }
  },

  // Get whitelist count
  getCount: () => {
    try {
      const row = db.prepare('SELECT COUNT(*) as count FROM email_domain_whitelist').get();
      return row.count;
    } catch (err) {
      throw err;
    }
  }
};

export {
  db,
  initializeDatabase,
  userDb,
  usageDb,
  verificationDb,
  domainWhitelistDb
};