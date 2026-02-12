import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { getUserPaths } from '../services/user-directories.js';

const router = express.Router();

// Allowed model environment variable keys
const MODEL_ENV_KEYS = [
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL'
];

/**
 * Read settings.json for a user, returns {} on error
 */
async function readSettingsJson(claudeDir) {
  const settingsPath = path.join(claudeDir, 'settings.json');
  try {
    const content = await fs.readFile(settingsPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Write settings.json for a user
 */
async function writeSettingsJson(claudeDir, settings) {
  const settingsPath = path.join(claudeDir, 'settings.json');
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

// GET /api/settings/models - Read model environment variables
router.get('/models', async (req, res) => {
  try {
    const userUuid = req.user?.uuid;
    if (!userUuid) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const userPaths = getUserPaths(userUuid);
    const settings = await readSettingsJson(userPaths.claudeDir);
    const env = settings.env || {};

    const models = {};
    for (const key of MODEL_ENV_KEYS) {
      models[key] = env[key] || '';
    }

    res.json({ success: true, models });
  } catch (error) {
    console.error('Error reading model settings:', error);
    res.status(500).json({ error: 'Failed to read model settings' });
  }
});

// PUT /api/settings/models - Update model environment variables
router.put('/models', async (req, res) => {
  try {
    const userUuid = req.user?.uuid;
    if (!userUuid) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const { models } = req.body;
    if (!models || typeof models !== 'object') {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const userPaths = getUserPaths(userUuid);
    const settings = await readSettingsJson(userPaths.claudeDir);

    if (!settings.env) {
      settings.env = {};
    }

    // Merge model env vars - empty string means remove the key
    for (const key of MODEL_ENV_KEYS) {
      if (key in models) {
        const value = (models[key] || '').trim();
        if (value) {
          settings.env[key] = value;
        } else {
          delete settings.env[key];
        }
      }
    }

    await writeSettingsJson(userPaths.claudeDir, settings);

    res.json({ success: true, message: 'Model settings saved' });
  } catch (error) {
    console.error('Error saving model settings:', error);
    res.status(500).json({ error: 'Failed to save model settings' });
  }
});

export default router;
