import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { addProjectManually } from '../projects.js';
import { getUserPaths } from '../services/user-directories.js';

const router = express.Router();

// Project name validation: letters, numbers, hyphens, underscores, 1-100 characters
const PROJECT_NAME_REGEX = /^[a-zA-Z0-9_-]{1,100}$/;

// Trusted git hosting domains
const TRUSTED_GIT_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org'];

/**
 * Validates a project name
 * @param {string} name - The project name to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateProjectName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Project name is required' };
  }

  if (!PROJECT_NAME_REGEX.test(name)) {
    return {
      valid: false,
      error: 'Project name must be 1-100 characters and contain only letters, numbers, hyphens, and underscores'
    };
  }

  return { valid: true };
}

/**
 * Validates a GitHub/Git repository URL
 * @param {string} url - The repository URL to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateGitHubUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Repository URL is required' };
  }

  // Parse the URL
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Only allow HTTPS protocol
  if (parsedUrl.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTPS URLs are allowed for security reasons' };
  }

  // Check if host is a trusted git hosting provider
  const host = parsedUrl.hostname.toLowerCase();
  if (!TRUSTED_GIT_HOSTS.includes(host)) {
    return {
      valid: false,
      error: `Only trusted git hosts are allowed: ${TRUSTED_GIT_HOSTS.join(', ')}`
    };
  }

  return { valid: true };
}

/**
 * Create a new project
 * POST /api/projects/create-workspace
 *
 * Body:
 * - name: string (project name, 1-100 chars, alphanumeric with hyphens/underscores)
 * - githubUrl?: string (optional, for cloning a public repository)
 */
router.post('/create-workspace', async (req, res) => {
  try {
    const { name, githubUrl } = req.body;

    // Validate project name
    const nameValidation = validateProjectName(name);
    if (!nameValidation.valid) {
      return res.status(400).json({ error: nameValidation.error });
    }

    // Get user UUID from authenticated request
    const userUuid = req.user?.uuid;
    if (!userUuid) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    // Get user's projects directory
    const { projectsDir } = getUserPaths(userUuid);

    // Calculate absolute path for the new project
    const absolutePath = path.join(projectsDir, name);

    // Check if directory already exists
    try {
      await fs.access(absolutePath);
      return res.status(400).json({
        error: 'A project with this name already exists. Please choose a different name.'
      });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // Path doesn't exist - good, we can create it
    }

    // If GitHub URL is provided, validate it BEFORE creating the directory
    if (githubUrl) {
      const urlValidation = validateGitHubUrl(githubUrl);
      if (!urlValidation.valid) {
        return res.status(400).json({ error: urlValidation.error });
      }
    }

    // Create the project directory (also creates parent directories if needed)
    await fs.mkdir(absolutePath, { recursive: true });

    // If GitHub URL is provided, clone the repository (public repos only)
    if (githubUrl) {

      try {
        await cloneGitHubRepository(githubUrl, absolutePath);
      } catch (error) {
        // Clean up created directory on failure
        try {
          await fs.rm(absolutePath, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error('Failed to clean up directory after clone failure:', cleanupError);
        }
        throw new Error(`Failed to clone repository: ${error.message}`);
      }
    }

    // Add the new project to the project list
    const project = await addProjectManually(absolutePath, null, userUuid);

    return res.json({
      success: true,
      project,
      message: githubUrl
        ? 'Project created and repository cloned successfully'
        : 'Project created successfully'
    });

  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({
      error: error.message || 'Failed to create project',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Helper function to clone a GitHub repository (public repos only)
 */
function cloneGitHubRepository(githubUrl, destinationPath) {
  return new Promise((resolve, reject) => {
    const gitProcess = spawn('git', ['clone', githubUrl, destinationPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0' // Disable git password prompts
      }
    });

    let stdout = '';
    let stderr = '';

    gitProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    gitProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    gitProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        // Parse git error messages to provide helpful feedback
        let errorMessage = 'Git clone failed';

        if (stderr.includes('Authentication failed') || stderr.includes('could not read Username')) {
          errorMessage = 'Authentication failed. Please check your GitHub token.';
        } else if (stderr.includes('Repository not found')) {
          errorMessage = 'Repository not found. Please check the URL and ensure you have access.';
        } else if (stderr.includes('already exists')) {
          errorMessage = 'Directory already exists';
        } else if (stderr) {
          errorMessage = stderr;
        }

        reject(new Error(errorMessage));
      }
    });

    gitProcess.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('Git is not installed or not in PATH'));
      } else {
        reject(error);
      }
    });
  });
}

export default router;
