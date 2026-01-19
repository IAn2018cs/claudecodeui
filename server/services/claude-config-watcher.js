import chokidar from 'chokidar';
import { promises as fs } from 'fs';
import { getUserPaths } from './user-directories.js';

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
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50
    }
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
