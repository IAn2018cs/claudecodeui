import { promises as fs } from 'fs';
import path from 'path';

// Base data directory (configurable via env)
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

// UUID validation regex to prevent path traversal attacks
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUuid(userUuid) {
  if (!userUuid || !UUID_REGEX.test(userUuid)) {
    throw new Error('Invalid user UUID format');
  }
}

/**
 * Get paths for a user
 */
export function getUserPaths(userUuid) {
  validateUuid(userUuid);
  return {
    configDir: path.join(DATA_DIR, 'user-data', userUuid),
    claudeDir: path.join(DATA_DIR, 'user-data', userUuid, '.claude'),
    projectsDir: path.join(DATA_DIR, 'user-projects', userUuid),
  };
}

/**
 * Initialize directories for a new user
 */
export async function initUserDirectories(userUuid) {
  validateUuid(userUuid);
  const paths = getUserPaths(userUuid);

  // Create directories
  await fs.mkdir(paths.claudeDir, { recursive: true });
  await fs.mkdir(paths.projectsDir, { recursive: true });

  // Create projects directory for Claude session files
  const projectsDir = path.join(paths.claudeDir, 'projects');
  await fs.mkdir(projectsDir, { recursive: true });

  // Create .claude.json with hasCompletedOnboarding=true
  const claudeJsonPath = path.join(paths.claudeDir, '.claude.json');
  const claudeConfig = {
    hasCompletedOnboarding: true
  };
  await fs.writeFile(claudeJsonPath, JSON.stringify(claudeConfig, null, 2));
  console.log(`Created .claude.json for user ${userUuid}`);

  // Create settings.json with proxy configuration
  const destSettings = path.join(paths.claudeDir, 'settings.json');
  const settingsConfig = {
    env: {
      ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN || '',
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || ''
    }
  };
  await fs.writeFile(destSettings, JSON.stringify(settingsConfig, null, 2));
  console.log(`Created settings.json for user ${userUuid}`);

  // Create usage scan state file (tracks last scanned position)
  const usageScanStatePath = path.join(paths.claudeDir, '.usage-scan-state.json');
  const scanState = {
    lastScanTime: null,
    scannedSessions: {}
  };
  await fs.writeFile(usageScanStatePath, JSON.stringify(scanState, null, 2));
  console.log(`Created .usage-scan-state.json for user ${userUuid}`);

  return paths;
}

/**
 * Delete all directories for a user
 */
export async function deleteUserDirectories(userUuid) {
  validateUuid(userUuid);
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
  validateUuid(userUuid);
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
