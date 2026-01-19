# Multi-User Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Claude Code UI from single-user to multi-user mode with user isolation and admin management.

**Architecture:** Use `CLAUDE_CONFIG_DIR` environment variable to isolate each user's Claude configuration. Store user data in `data/user-data/{uuid}/` and projects in `data/user-projects/{uuid}/`. First registered user becomes admin.

**Tech Stack:** Node.js/Express backend, SQLite database, React frontend, Claude Agent SDK

---

## Task 1: Database Schema Migration

**Files:**
- Modify: `server/database/init.sql`
- Modify: `server/database/db.js`

### Step 1: Update init.sql schema

Add new columns to users table:

```sql
-- In init.sql, update users table definition
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    uuid TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user')),
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_active BOOLEAN DEFAULT 1,
    git_name TEXT,
    git_email TEXT,
    has_completed_onboarding BOOLEAN DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
```

### Step 2: Add migration in db.js

Add to `runMigrations()` function:

```javascript
// Add uuid column if not exists
if (!columnNames.includes('uuid')) {
  console.log('Running migration: Adding uuid column');
  db.exec('ALTER TABLE users ADD COLUMN uuid TEXT UNIQUE');
}

// Add role column if not exists
if (!columnNames.includes('role')) {
  console.log('Running migration: Adding role column');
  db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
}

// Add status column if not exists
if (!columnNames.includes('status')) {
  console.log('Running migration: Adding status column');
  db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'");
}
```

### Step 3: Add userDb methods in db.js

```javascript
// Get user count
getUserCount: () => {
  const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
  return row.count;
},

// Create user with full details
createUserFull: (username, passwordHash, uuid, role) => {
  const stmt = db.prepare(
    'INSERT INTO users (username, password_hash, uuid, role) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(username, passwordHash, uuid, role);
  return { id: result.lastInsertRowid, username, uuid, role };
},

// Get all users (for admin)
getAllUsers: () => {
  return db.prepare(
    'SELECT id, username, uuid, role, status, created_at, last_login FROM users ORDER BY created_at DESC'
  ).all();
},

// Update user status
updateUserStatus: (userId, status) => {
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, userId);
},

// Delete user by ID
deleteUserById: (userId) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
},

// Get user by UUID
getUserByUuid: (uuid) => {
  return db.prepare('SELECT * FROM users WHERE uuid = ?').get(uuid);
},
```

### Step 4: Verify migration works

Run: `node server/index.js` (start server briefly to trigger migration)
Expected: See migration logs, no errors

### Step 5: Commit

```bash
git add server/database/init.sql server/database/db.js
git commit -m "feat: add multi-user database schema

Add uuid, role, and status columns to users table.
Add userDb methods for multi-user management."
```

---

## Task 2: User Directory Management Service

**Files:**
- Create: `server/services/user-directories.js`

### Step 1: Create user directories service

```javascript
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Base data directory (configurable via env)
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

/**
 * Get paths for a user
 */
export function getUserPaths(userUuid) {
  return {
    configDir: path.join(DATA_DIR, 'user-data', userUuid),
    claudeDir: path.join(DATA_DIR, 'user-data', userUuid, '.claude'),
    claudeJson: path.join(DATA_DIR, 'user-data', userUuid, '.claude.json'),
    projectsDir: path.join(DATA_DIR, 'user-projects', userUuid),
  };
}

/**
 * Initialize directories for a new user
 */
export async function initUserDirectories(userUuid) {
  const paths = getUserPaths(userUuid);

  // Create directories
  await fs.mkdir(paths.claudeDir, { recursive: true });
  await fs.mkdir(paths.projectsDir, { recursive: true });

  // Copy settings.json from ~/.claude if exists
  const sourceSettings = path.join(os.homedir(), '.claude', 'settings.json');
  const destSettings = path.join(paths.claudeDir, 'settings.json');

  try {
    await fs.access(sourceSettings);
    await fs.copyFile(sourceSettings, destSettings);
    console.log(`Copied settings.json for user ${userUuid}`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Error copying settings.json:', error);
    }
    // If source doesn't exist, that's fine - user will use defaults
  }

  return paths;
}

/**
 * Delete all directories for a user
 */
export async function deleteUserDirectories(userUuid) {
  const paths = getUserPaths(userUuid);

  try {
    await fs.rm(paths.configDir, { recursive: true, force: true });
    await fs.rm(paths.projectsDir, { recursive: true, force: true });
    console.log(`Deleted directories for user ${userUuid}`);
  } catch (error) {
    console.error(`Error deleting directories for user ${userUuid}:`, error);
    throw error;
  }
}

/**
 * Check if user directories exist
 */
export async function userDirectoriesExist(userUuid) {
  const paths = getUserPaths(userUuid);
  try {
    await fs.access(paths.configDir);
    await fs.access(paths.projectsDir);
    return true;
  } catch {
    return false;
  }
}

export { DATA_DIR };
```

### Step 2: Commit

```bash
git add server/services/user-directories.js
git commit -m "feat: add user directories management service

Handles creation, deletion, and path resolution for per-user data."
```

---

## Task 3: Claude Config Watcher Service

**Files:**
- Create: `server/services/claude-config-watcher.js`

### Step 1: Create config watcher service

```javascript
import chokidar from 'chokidar';
import { promises as fs } from 'fs';
import { getUserPaths, DATA_DIR } from './user-directories.js';
import path from 'path';

// Map of userUuid -> watcher instance
const watchers = new Map();

/**
 * Watch for .claude.json creation and set hasCompletedOnboarding
 */
export function watchUserClaudeConfig(userUuid) {
  const paths = getUserPaths(userUuid);
  const configPath = paths.claudeJson;

  // Don't create duplicate watchers
  if (watchers.has(userUuid)) {
    return;
  }

  console.log(`Starting config watcher for user ${userUuid}`);

  const watcher = chokidar.watch(configPath, {
    ignoreInitial: false,
    persistent: true,
  });

  watcher.on('add', async (filePath) => {
    console.log(`Detected .claude.json creation for user ${userUuid}`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const config = JSON.parse(content);

      if (!config.hasCompletedOnboarding) {
        config.hasCompletedOnboarding = true;
        await fs.writeFile(filePath, JSON.stringify(config, null, 2));
        console.log(`Set hasCompletedOnboarding=true for user ${userUuid}`);
      }

      // Stop watching after successful update
      stopWatcher(userUuid);
    } catch (error) {
      console.error(`Error processing .claude.json for user ${userUuid}:`, error);
    }
  });

  watcher.on('error', (error) => {
    console.error(`Watcher error for user ${userUuid}:`, error);
  });

  watchers.set(userUuid, watcher);
}

/**
 * Stop watching for a specific user
 */
export function stopWatcher(userUuid) {
  const watcher = watchers.get(userUuid);
  if (watcher) {
    watcher.close();
    watchers.delete(userUuid);
    console.log(`Stopped config watcher for user ${userUuid}`);
  }
}

/**
 * Stop all watchers
 */
export function stopAllWatchers() {
  for (const [userUuid, watcher] of watchers) {
    watcher.close();
    console.log(`Stopped config watcher for user ${userUuid}`);
  }
  watchers.clear();
}

/**
 * Initialize watchers for all users that need them
 */
export async function initializeWatchers(users) {
  for (const user of users) {
    if (!user.uuid) continue;

    const paths = getUserPaths(user.uuid);
    try {
      // Check if .claude.json exists and has onboarding completed
      const content = await fs.readFile(paths.claudeJson, 'utf-8');
      const config = JSON.parse(content);

      if (!config.hasCompletedOnboarding) {
        watchUserClaudeConfig(user.uuid);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, watch for it
        watchUserClaudeConfig(user.uuid);
      }
    }
  }
}
```

### Step 2: Commit

```bash
git add server/services/claude-config-watcher.js
git commit -m "feat: add Claude config watcher service

Watches for .claude.json creation and sets hasCompletedOnboarding=true."
```

---

## Task 4: Update Auth Routes for Multi-User

**Files:**
- Modify: `server/routes/auth.js`

### Step 1: Update imports

```javascript
import { v4 as uuidv4 } from 'uuid';
import { initUserDirectories, deleteUserDirectories } from '../services/user-directories.js';
import { watchUserClaudeConfig } from '../services/claude-config-watcher.js';
```

### Step 2: Update register endpoint

Replace the existing register route with:

```javascript
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

    db.prepare('BEGIN').run();
    try {
      // Check if this is the first user (becomes admin)
      const userCount = userDb.getUserCount();
      const role = userCount === 0 ? 'admin' : 'user';
      const uuid = uuidv4();

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user with full details
      const user = userDb.createUserFull(username, passwordHash, uuid, role);

      // Initialize user directories
      await initUserDirectories(uuid);

      // Start watching for .claude.json
      watchUserClaudeConfig(uuid);

      // Generate token
      const token = generateToken(user);

      // Update last login
      userDb.updateLastLogin(user.id);

      db.prepare('COMMIT').run();

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
      db.prepare('ROLLBACK').run();
      throw error;
    }

  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});
```

### Step 3: Update login endpoint

Add status check to login:

```javascript
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
```

### Step 4: Update /user endpoint to include uuid and role

```javascript
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
```

### Step 5: Commit

```bash
git add server/routes/auth.js
git commit -m "feat: update auth routes for multi-user support

- First registered user becomes admin
- Generate UUID and create user directories on register
- Check user status on login
- Include uuid and role in responses"
```

---

## Task 5: Add Admin Routes

**Files:**
- Create: `server/routes/admin.js`
- Modify: `server/index.js`

### Step 1: Create admin routes

```javascript
import express from 'express';
import { userDb } from '../database/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { deleteUserDirectories } from '../services/user-directories.js';
import { stopWatcher } from '../services/claude-config-watcher.js';

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

    // Get full user info for uuid
    const fullUser = userDb.getUserByUuid(user.uuid);

    // Stop config watcher
    if (fullUser?.uuid) {
      stopWatcher(fullUser.uuid);

      // Delete user directories
      await deleteUserDirectories(fullUser.uuid);
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
```

### Step 2: Register admin routes in server/index.js

Add import:
```javascript
import adminRoutes from './routes/admin.js';
```

Add route:
```javascript
app.use('/api/admin', adminRoutes);
```

### Step 3: Commit

```bash
git add server/routes/admin.js server/index.js
git commit -m "feat: add admin routes for user management

- GET /api/admin/users - list all users
- PATCH /api/admin/users/:id - update user status
- DELETE /api/admin/users/:id - delete user and cleanup"
```

---

## Task 6: Update Auth Middleware for User Status Check

**Files:**
- Modify: `server/middleware/auth.js`

### Step 1: Update authenticateToken to check status

```javascript
const authenticateToken = async (req, res, next) => {
  // Platform mode bypass...
  if (process.env.VITE_IS_PLATFORM === 'true') {
    // ... existing code
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = userDb.getUserById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'Invalid token. User not found.' });
    }

    // Check user status
    if (user.status === 'disabled') {
      return res.status(401).json({ error: 'Account has been disabled' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};
```

### Step 2: Update generateToken to include uuid and role

```javascript
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      uuid: user.uuid,
      role: user.role
    },
    JWT_SECRET
  );
};
```

### Step 3: Commit

```bash
git add server/middleware/auth.js
git commit -m "feat: update auth middleware for multi-user

- Check user status on each request
- Include uuid and role in JWT token"
```

---

## Task 7: Update Claude SDK for User Isolation

**Files:**
- Modify: `server/claude-sdk.js`

### Step 1: Add user config directory injection

Add import at top:
```javascript
import { getUserPaths } from './services/user-directories.js';
```

Update `queryClaudeSDK` function to accept user context and set environment:

```javascript
async function queryClaudeSDK(command, options = {}, ws) {
  const { sessionId, userUuid } = options;

  // Set CLAUDE_CONFIG_DIR for user isolation
  if (userUuid) {
    const userPaths = getUserPaths(userUuid);
    process.env.CLAUDE_CONFIG_DIR = userPaths.configDir;
    console.log(`Set CLAUDE_CONFIG_DIR to ${userPaths.configDir} for user ${userUuid}`);
  }

  // ... rest of existing function
}
```

### Step 2: Update loadMcpConfig to use user config

```javascript
async function loadMcpConfig(cwd, userUuid = null) {
  try {
    const configDir = userUuid
      ? getUserPaths(userUuid).configDir
      : os.homedir();
    const claudeJsonPath = path.join(configDir, '.claude.json');

    // ... rest of existing function using claudeJsonPath
  }
}
```

### Step 3: Commit

```bash
git add server/claude-sdk.js
git commit -m "feat: add user isolation to Claude SDK

Set CLAUDE_CONFIG_DIR based on user UUID for per-user config isolation."
```

---

## Task 8: Update Projects Module for User Isolation

**Files:**
- Modify: `server/projects.js`

### Step 1: Update getProjects to support user-specific paths

```javascript
import { getUserPaths, DATA_DIR } from './services/user-directories.js';

// Add userUuid parameter to getProjects
async function getProjects(userUuid = null) {
  let claudeDir;

  if (userUuid) {
    const userPaths = getUserPaths(userUuid);
    claudeDir = path.join(userPaths.configDir, '.claude', 'projects');
  } else {
    claudeDir = path.join(os.homedir(), '.claude', 'projects');
  }

  // ... rest of function using claudeDir
}
```

### Step 2: Update other functions similarly

Add `userUuid` parameter to:
- `getSessions(projectName, limit, offset, userUuid)`
- `getSessionMessages(projectName, sessionId, limit, offset, userUuid)`
- `loadProjectConfig(userUuid)`
- `saveProjectConfig(config, userUuid)`

### Step 3: Commit

```bash
git add server/projects.js
git commit -m "feat: update projects module for user isolation

All project operations now support user-specific paths."
```

---

## Task 9: Update Server WebSocket Handler for User Context

**Files:**
- Modify: `server/index.js`

### Step 1: Extract user from WebSocket authentication

Update the WebSocket message handler to pass user context:

```javascript
// In the WebSocket message handler where queryClaudeSDK is called
const userUuid = userData?.uuid || null;

// Pass userUuid to queryClaudeSDK
await queryClaudeSDK(prompt, {
  ...options,
  userUuid,
}, wsWriter);
```

### Step 2: Update project-related API calls

Pass user context to project functions:

```javascript
// In GET /api/projects
app.get('/api/projects', authenticateToken, async (req, res) => {
  const projects = await getProjects(req.user.uuid);
  res.json({ projects });
});
```

### Step 3: Commit

```bash
git add server/index.js
git commit -m "feat: pass user context through WebSocket and API

User UUID is now passed to Claude SDK and project functions."
```

---

## Task 10: Install uuid Package

**Files:**
- Modify: `package.json`

### Step 1: Install uuid package

Run: `npm install uuid`

### Step 2: Commit

```bash
git add package.json package-lock.json
git commit -m "chore: add uuid package for user ID generation"
```

---

## Task 11: Frontend - Update AuthContext for Multi-User

**Files:**
- Modify: `src/contexts/AuthContext.jsx`

### Step 1: Update user state to include uuid and role

```javascript
const [user, setUser] = useState(null);
// user will now have: { id, username, uuid, role }

// Update login and register to store full user info
const login = async (username, password) => {
  // ... existing code
  if (response.ok) {
    setToken(data.token);
    setUser(data.user); // data.user now includes uuid and role
    localStorage.setItem('auth-token', data.token);
    return { success: true };
  }
  // ...
};
```

### Step 2: Add isAdmin helper

```javascript
const value = {
  user,
  token,
  login,
  register,
  logout,
  isLoading,
  needsSetup,
  error,
  isAdmin: user?.role === 'admin'
};
```

### Step 3: Commit

```bash
git add src/contexts/AuthContext.jsx
git commit -m "feat: update AuthContext for multi-user

Include uuid and role in user state, add isAdmin helper."
```

---

## Task 12: Frontend - Create UserManagement Component

**Files:**
- Create: `src/components/settings/UserManagement.jsx`

### Step 1: Create UserManagement component

```javascript
import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Trash2, UserCheck, UserX, Shield, User } from 'lucide-react';
import { authenticatedFetch } from '../../utils/api';

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchUsers = async () => {
    try {
      const response = await authenticatedFetch('/api/admin/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toggleStatus = async (userId, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    setActionLoading(userId);
    try {
      const response = await authenticatedFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (response.ok) {
        setUsers(users.map(u =>
          u.id === userId ? { ...u, status: newStatus } : u
        ));
      }
    } catch (error) {
      console.error('Error updating user status:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const deleteUser = async (userId, username) => {
    if (!confirm(`Are you sure you want to delete user "${username}"? This will delete all their data.`)) {
      return;
    }
    setActionLoading(userId);
    try {
      const response = await authenticatedFetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setUsers(users.filter(u => u.id !== userId));
      }
    } catch (error) {
      console.error('Error deleting user:', error);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading users...</div>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">User Management</h3>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">User</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Role</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Created</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {user.role === 'admin' ? (
                      <Shield className="w-4 h-4 text-blue-500" />
                    ) : (
                      <User className="w-4 h-4 text-gray-400" />
                    )}
                    <span className="font-medium text-foreground">{user.username}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                    {user.role === 'admin' ? 'Admin' : 'User'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={user.status === 'active' ? 'success' : 'destructive'}>
                    {user.status === 'active' ? 'Active' : 'Disabled'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {user.role !== 'admin' && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleStatus(user.id, user.status)}
                          disabled={actionLoading === user.id}
                          title={user.status === 'active' ? 'Disable user' : 'Enable user'}
                        >
                          {user.status === 'active' ? (
                            <UserX className="w-4 h-4 text-orange-500" />
                          ) : (
                            <UserCheck className="w-4 h-4 text-green-500" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteUser(user.id, user.username)}
                          disabled={actionLoading === user.id}
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default UserManagement;
```

### Step 2: Commit

```bash
git add src/components/settings/UserManagement.jsx
git commit -m "feat: add UserManagement component for admin panel

Display user list with status toggle and delete actions."
```

---

## Task 13: Frontend - Add User Management Tab to Settings

**Files:**
- Modify: `src/components/Settings.jsx`

### Step 1: Import UserManagement and useAuth

```javascript
import UserManagement from './settings/UserManagement';
import { useAuth } from '../contexts/AuthContext';
```

### Step 2: Add isAdmin check and Users tab

Inside the Settings component:

```javascript
const { isAdmin } = useAuth();
```

Add tab button after Appearance:
```javascript
{isAdmin && (
  <button
    onClick={() => setActiveTab('users')}
    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
      activeTab === 'users'
        ? 'border-blue-600 text-blue-600 dark:text-blue-400'
        : 'border-transparent text-muted-foreground hover:text-foreground'
    }`}
  >
    Users
  </button>
)}
```

### Step 3: Add Users tab content

After the Appearance tab content:
```javascript
{activeTab === 'users' && isAdmin && (
  <div className="space-y-6 md:space-y-8">
    <UserManagement />
  </div>
)}
```

### Step 4: Commit

```bash
git add src/components/Settings.jsx
git commit -m "feat: add Users tab to Settings for admin

Admin users can now manage other users from Settings."
```

---

## Task 14: Create data Directory and Add to .gitignore

**Files:**
- Modify: `.gitignore`

### Step 1: Add data directory to gitignore

```bash
# Add to .gitignore
echo "" >> .gitignore
echo "# Multi-user data" >> .gitignore
echo "data/" >> .gitignore
```

### Step 2: Create data directory structure placeholder

```bash
mkdir -p data/user-data data/user-projects
touch data/.gitkeep
```

### Step 3: Commit

```bash
git add .gitignore
git commit -m "chore: add data directory to gitignore

User data will be stored in data/ directory."
```

---

## Task 15: Integration Testing

### Step 1: Start the server

Run: `npm run dev` or `node server/index.js`

### Step 2: Test registration flow

1. Open browser to http://localhost:3000
2. Register first user (should become admin)
3. Verify `data/user-data/{uuid}/.claude/` directory created
4. Verify `data/user-projects/{uuid}/` directory created

### Step 3: Test second user registration

1. Logout
2. Register second user
3. Login as second user
4. Verify they cannot see admin Users tab

### Step 4: Test admin user management

1. Login as admin
2. Go to Settings > Users
3. Test disable/enable user
4. Test delete user (verify directories removed)

### Step 5: Commit final changes if any fixes needed

```bash
git add -A
git commit -m "fix: integration testing fixes"
```

---

## Task 16: Final Verification and Documentation

### Step 1: Run build

Run: `npm run build`
Expected: Build succeeds without errors

### Step 2: Run production mode test

Run: `NODE_ENV=production node server/index.js`
Expected: Server starts, all features work

### Step 3: Commit and push

```bash
git push -u origin feature/multi-user
```

---

## Summary of Changes

**Backend:**
- Database schema extended with uuid, role, status columns
- User directories service for per-user data isolation
- Claude config watcher for onboarding setup
- Admin routes for user management
- Auth middleware checks user status
- Claude SDK uses per-user config directories
- Projects module supports user-specific paths

**Frontend:**
- AuthContext includes uuid, role, isAdmin
- UserManagement component for admin panel
- Settings has Users tab for admin

**Data Structure:**
```
data/
├── user-data/{uuid}/
│   ├── .claude/
│   │   └── settings.json
│   └── .claude.json
└── user-projects/{uuid}/
    └── {project-name}/
```
