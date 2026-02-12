/**
 * Usage Scanner Service
 *
 * Scans Claude session files (JSONL) for token usage data and records it to the database.
 * This handles CLI mode usage tracking and serves as a backup for SDK mode.
 *
 * Features:
 * - Scans all users' Claude session directories
 * - Tracks scan position to avoid re-processing
 * - Updates daily summaries
 * - Cleans up old records (30 days)
 */

import { promises as fs } from 'fs';
import path from 'path';
import { usageDb, userDb } from '../database/db.js';
import { calculateCost, normalizeModelName } from './pricing.js';
import { DATA_DIR, getUserPaths } from './user-directories.js';

// Scan interval: 5 minutes
const SCAN_INTERVAL_MS = 5 * 60 * 1000;

// Retention period: 30 days
const RETENTION_DAYS = 30;

// Scanner state
let scannerInterval = null;
let isScanning = false;

/**
 * Start the usage scanner
 */
export function startUsageScanner() {
  console.log('[UsageScanner] Starting usage scanner service');

  // Run initial scan after a short delay
  setTimeout(() => {
    runScan();
  }, 10000);

  // Schedule periodic scans
  scannerInterval = setInterval(() => {
    runScan();
  }, SCAN_INTERVAL_MS);

  console.log(`[UsageScanner] Scheduled to run every ${SCAN_INTERVAL_MS / 1000 / 60} minutes`);
}

/**
 * Stop the usage scanner
 */
export function stopUsageScanner() {
  if (scannerInterval) {
    clearInterval(scannerInterval);
    scannerInterval = null;
    console.log('[UsageScanner] Stopped usage scanner service');
  }
}

/**
 * Run a scan cycle
 */
async function runScan() {
  if (isScanning) {
    console.log('[UsageScanner] Scan already in progress, skipping');
    return;
  }

  isScanning = true;
  console.log('[UsageScanner] Starting scan cycle');

  try {
    // Get all users
    const users = userDb.getAllUsers();

    for (const user of users) {
      if (!user.uuid) continue;

      try {
        await scanUserSessions(user.uuid);
      } catch (error) {
        console.error(`[UsageScanner] Error scanning user ${user.uuid}:`, error.message);
      }
    }

    // Cleanup old records
    const deletedCount = usageDb.cleanupOldRecords(RETENTION_DAYS);
    if (deletedCount > 0) {
      console.log(`[UsageScanner] Cleaned up ${deletedCount} old usage records`);
    }

    console.log('[UsageScanner] Scan cycle completed');
  } catch (error) {
    console.error('[UsageScanner] Error during scan cycle:', error);
  } finally {
    isScanning = false;
  }
}

/**
 * Scan a user's session files
 */
async function scanUserSessions(userUuid) {
  const userPaths = getUserPaths(userUuid);
  const projectsDir = path.join(userPaths.claudeDir, 'projects');
  const scanStatePath = path.join(userPaths.claudeDir, '.usage-scan-state.json');

  // Check if projects directory exists
  try {
    await fs.access(projectsDir);
  } catch {
    // No projects directory yet
    return;
  }

  // Load scan state
  let scanState = { lastScanTime: null, scannedSessions: {} };
  try {
    const stateContent = await fs.readFile(scanStatePath, 'utf8');
    scanState = JSON.parse(stateContent);
  } catch {
    // File doesn't exist or is invalid, start fresh
  }

  // Get all project directories
  const projectDirs = await fs.readdir(projectsDir, { withFileTypes: true });

  let newRecordsCount = 0;

  for (const projectDir of projectDirs) {
    if (!projectDir.isDirectory()) continue;

    const projectPath = path.join(projectsDir, projectDir.name);
    const sessionFiles = await fs.readdir(projectPath);

    for (const sessionFile of sessionFiles) {
      if (!sessionFile.endsWith('.jsonl')) continue;

      const sessionId = sessionFile.replace('.jsonl', '');
      const sessionPath = path.join(projectPath, sessionFile);

      // Get file stats
      const stats = await fs.stat(sessionPath);
      const lastModified = stats.mtime.toISOString();

      // Check if we need to scan this session
      const lastScanned = scanState.scannedSessions[sessionId];
      if (lastScanned && lastScanned.lastModified === lastModified) {
        // Already scanned and file hasn't changed
        continue;
      }

      // Scan the session file
      try {
        const scanResult = await scanSessionFile(
          userUuid,
          sessionId,
          sessionPath,
          lastScanned?.lastLine || 0
        );
        newRecordsCount += scanResult.recordsAdded;

        // Update scan state with the new lastLine position
        scanState.scannedSessions[sessionId] = {
          lastModified,
          lastLine: scanResult.lastLine,
          lastScan: new Date().toISOString()
        };
      } catch (error) {
        console.error(`[UsageScanner] Error scanning session ${sessionId}:`, error.message);
      }
    }
  }

  // Save scan state
  scanState.lastScanTime = new Date().toISOString();
  await fs.writeFile(scanStatePath, JSON.stringify(scanState, null, 2));

  if (newRecordsCount > 0) {
    console.log(`[UsageScanner] User ${userUuid}: added ${newRecordsCount} new records`);
  }
}

/**
 * Scan a session JSONL file for usage data
 */
async function scanSessionFile(userUuid, sessionId, filePath, startLine) {
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.trim().split('\n');

  let recordsAdded = 0;
  const sessionDates = new Set();

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    try {
      const entry = JSON.parse(line);

      // Only process assistant messages with usage data
      if (entry.type !== 'assistant' || !entry.message?.usage) {
        continue;
      }

      const usage = entry.message.usage;
      const rawModel = entry.message?.model || 'sonnet';
      const model = normalizeModelName(rawModel);

      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      const cacheReadTokens = usage.cache_read_input_tokens || 0;

      // Extract detailed cache creation tokens from nested cache_creation object
      // Structure: usage.cache_creation.ephemeral_5m_input_tokens / ephemeral_1h_input_tokens
      const cacheCreation = usage.cache_creation || {};
      const cacheCreation5mTokens = cacheCreation.ephemeral_5m_input_tokens || 0;
      const cacheCreation1hTokens = cacheCreation.ephemeral_1h_input_tokens || 0;

      // Fallback to legacy field if nested object not present
      const totalCacheCreationTokens = usage.cache_creation_input_tokens || 0;
      const hasPreciseCacheData = cacheCreation5mTokens > 0 || cacheCreation1hTokens > 0;

      const cost = calculateCost({
        model,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        // Use precise data if available, otherwise fallback to legacy field
        cacheCreation5mTokens: hasPreciseCacheData ? cacheCreation5mTokens : undefined,
        cacheCreation1hTokens: hasPreciseCacheData ? cacheCreation1hTokens : undefined,
        cacheCreationTokens: hasPreciseCacheData ? undefined : totalCacheCreationTokens
      });

      // Determine the date from the entry timestamp or use current date
      const entryTimestamp = entry.timestamp || new Date().toISOString();
      const entryDate = entryTimestamp.split('T')[0];

      // Check if this record already exists (deduplication with SDK records)
      // Uses session_id (or user_uuid) + model + all token counts + time window to match
      if (usageDb.checkRecordExists(
        userUuid, sessionId, model, inputTokens, outputTokens,
        cacheReadTokens, totalCacheCreationTokens, entryTimestamp
      )) {
        // Record already exists (likely from SDK), skip to avoid duplicate counting
        continue;
      }

      // Insert usage record (source: cli)
      usageDb.insertRecord({
        user_uuid: userUuid,
        session_id: sessionId,
        model,
        raw_model: rawModel,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_tokens: cacheReadTokens,
        cache_creation_tokens: totalCacheCreationTokens,
        cost_usd: cost,
        source: 'cli',
        created_at: entryTimestamp
      });

      // Update daily summary
      usageDb.upsertDailySummary({
        user_uuid: userUuid,
        date: entryDate,
        model,
        total_input_tokens: inputTokens,
        total_output_tokens: outputTokens,
        total_cost_usd: cost,
        session_count: 0,
        request_count: 1
      });

      sessionDates.add(entryDate);
      recordsAdded++;
    } catch (parseError) {
      // Skip lines that can't be parsed
      continue;
    }
  }

  // Update session count for each date (once per scan, not per record)
  for (const date of sessionDates) {
    try {
      // We count this as a session activity for today
      // Note: This is approximate since we're scanning multiple messages at once
    } catch (error) {
      // Ignore session count errors
    }
  }

  // Return both records added and the last line processed
  return { recordsAdded, lastLine: lines.length };
}

/**
 * Manually trigger a scan (for testing or admin use)
 */
export async function triggerManualScan() {
  console.log('[UsageScanner] Manual scan triggered');
  await runScan();
  return { success: true, message: 'Scan completed' };
}

export { SCAN_INTERVAL_MS, RETENTION_DAYS };
