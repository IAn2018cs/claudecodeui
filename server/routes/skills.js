import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { getUserPaths, getPublicPaths, DATA_DIR } from '../services/user-directories.js';
import { markBuiltinSkillRemoved, isBuiltinSkillPath } from '../services/builtin-skills.js';

const router = express.Router();

// Skill name validation: letters, numbers, hyphens, underscores
const SKILL_NAME_REGEX = /^[a-zA-Z0-9_-]{1,100}$/;

// Trusted git hosting domains
const TRUSTED_GIT_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org', 'git.amberweather.com'];

// Configure multer for zip file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'));
    }
  }
});

/**
 * Parse skill metadata from SKILLS.md file
 */
async function parseSkillMetadata(skillPath) {
  try {
    const skillsFile = path.join(skillPath, 'SKILLS.md');
    const content = await fs.readFile(skillsFile, 'utf-8');

    // Extract title from first # heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : path.basename(skillPath);

    // Extract description from content after title (first paragraph)
    const lines = content.split('\n');
    let description = '';
    let foundTitle = false;
    for (const line of lines) {
      if (line.startsWith('#')) {
        if (foundTitle) break;
        foundTitle = true;
        continue;
      }
      if (foundTitle && line.trim()) {
        description = line.trim();
        break;
      }
    }

    return { title, description };
  } catch {
    return { title: path.basename(skillPath), description: '' };
  }
}

/**
 * Check if a path is a valid skill directory
 */
async function isValidSkill(skillPath) {
  try {
    const stat = await fs.stat(skillPath);
    if (!stat.isDirectory()) return false;

    // Check for SKILLS.md
    try {
      await fs.access(path.join(skillPath, 'SKILLS.md'));
      return true;
    } catch {
      // Fallback: check for any .md files
      const files = await fs.readdir(skillPath);
      return files.some(f => f.endsWith('.md'));
    }
  } catch {
    return false;
  }
}

/**
 * Check if URL is SSH format (git@host:path)
 */
function isSshUrl(url) {
  return /^[a-zA-Z0-9_-]+@[a-zA-Z0-9.-]+:.+$/.test(url);
}

/**
 * Parse SSH URL format (git@host:owner/repo.git)
 */
function parseSshUrl(url) {
  const match = url.match(/^[a-zA-Z0-9_-]+@([a-zA-Z0-9.-]+):(.+)$/);
  if (!match) return null;

  const host = match[1].toLowerCase();
  const pathPart = match[2].replace(/\.git$/, '');
  const pathParts = pathPart.split('/');

  if (pathParts.length >= 2) {
    return { host, owner: pathParts[0], repo: pathParts[1] };
  }
  return { host, owner: null, repo: null };
}

/**
 * Validate GitHub URL
 */
function validateGitUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Repository URL is required' };
  }

  // Handle SSH format: git@host:owner/repo.git
  if (isSshUrl(url)) {
    const parsed = parseSshUrl(url);
    if (!parsed) {
      return { valid: false, error: 'Invalid SSH URL format' };
    }

    if (!TRUSTED_GIT_HOSTS.includes(parsed.host)) {
      return {
        valid: false,
        error: `Only trusted git hosts are allowed: ${TRUSTED_GIT_HOSTS.join(', ')}`
      };
    }

    return { valid: true, isSsh: true };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  const host = parsedUrl.hostname.toLowerCase();
  const allowedProtocols = ['https:', 'http:'];

  // Allow http protocol only for git.amberweather.com
  if (host === 'git.amberweather.com') {
    if (!allowedProtocols.includes(parsedUrl.protocol)) {
      return { valid: false, error: 'Only HTTPS or HTTP URLs are allowed for this host' };
    }
  } else {
    if (parsedUrl.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTPS URLs are allowed' };
    }
  }

  if (!TRUSTED_GIT_HOSTS.includes(host)) {
    return {
      valid: false,
      error: `Only trusted git hosts are allowed: ${TRUSTED_GIT_HOSTS.join(', ')}`
    };
  }

  return { valid: true };
}

/**
 * Extract owner and repo from git URL
 */
function parseGitUrl(url) {
  // Handle SSH format
  if (isSshUrl(url)) {
    const parsed = parseSshUrl(url);
    if (parsed && parsed.owner && parsed.repo) {
      return { owner: parsed.owner, repo: parsed.repo };
    }
    return null;
  }

  const parsedUrl = new URL(url);
  const pathParts = parsedUrl.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
  if (pathParts.length >= 2) {
    return { owner: pathParts[0], repo: pathParts[1] };
  }
  return null;
}

/**
 * Clone a git repository
 */
function cloneRepository(url, destinationPath) {
  return new Promise((resolve, reject) => {
    const gitProcess = spawn('git', ['clone', '--depth', '1', url, destinationPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0'
      }
    });

    let stderr = '';
    gitProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    gitProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `Git clone failed with code ${code}`));
      }
    });

    gitProcess.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Update a git repository
 */
function updateRepository(repoPath) {
  return new Promise((resolve, reject) => {
    const gitProcess = spawn('git', ['pull', '--ff-only'], {
      cwd: repoPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0'
      }
    });

    let stderr = '';
    gitProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    gitProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `Git pull failed with code ${code}`));
      }
    });

    gitProcess.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * GET /api/skills
 * List user's installed skills
 */
router.get('/', async (req, res) => {
  try {
    const userUuid = req.user?.uuid;
    if (!userUuid) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const userPaths = getUserPaths(userUuid);

    // Ensure directory exists
    await fs.mkdir(userPaths.skillsDir, { recursive: true });

    const entries = await fs.readdir(userPaths.skillsDir, { withFileTypes: true });
    const skills = [];

    for (const entry of entries) {
      // Skip hidden files and READMEs
      if (entry.name.startsWith('.') || entry.name.toLowerCase().startsWith('readme')) {
        continue;
      }

      const skillPath = path.join(userPaths.skillsDir, entry.name);
      let realPath = skillPath;
      let isSymlink = false;
      let source = 'unknown';
      let repository = null;

      try {
        const stat = await fs.lstat(skillPath);
        isSymlink = stat.isSymbolicLink();

        if (isSymlink) {
          realPath = await fs.realpath(skillPath);

          // Determine source based on realPath
          if (realPath.includes('/skills-import/')) {
            source = 'imported';
          } else if (realPath.includes('/skills-repo/')) {
            source = 'repo';
            // Extract repository info from path
            const repoMatch = realPath.match(/skills-repo\/([^/]+)\/([^/]+)/);
            if (repoMatch) {
              repository = `${repoMatch[1]}/${repoMatch[2]}`;
            }
          } else if (realPath.includes('/builtin-skills/')) {
            source = 'builtin';
          }
        }

        // Check if it's a valid skill
        if (!await isValidSkill(realPath)) {
          continue;
        }

        const metadata = await parseSkillMetadata(realPath);

        skills.push({
          name: entry.name,
          title: metadata.title,
          description: metadata.description,
          enabled: true,
          source,
          repository,
          path: realPath
        });
      } catch (err) {
        console.error(`Error reading skill ${entry.name}:`, err.message);
      }
    }

    res.json({ skills, count: skills.length });
  } catch (error) {
    console.error('Error listing skills:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/skills/enable/:name
 * Enable a skill by creating symlink
 */
router.post('/enable/:name', async (req, res) => {
  try {
    const userUuid = req.user?.uuid;
    if (!userUuid) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const { name } = req.params;
    const { skillPath } = req.body;

    if (!SKILL_NAME_REGEX.test(name)) {
      return res.status(400).json({ error: 'Invalid skill name' });
    }

    if (!skillPath) {
      return res.status(400).json({ error: 'Skill path is required' });
    }

    const userPaths = getUserPaths(userUuid);
    const linkPath = path.join(userPaths.skillsDir, name);

    // Check if already exists
    try {
      await fs.access(linkPath);
      return res.status(400).json({ error: 'Skill is already enabled' });
    } catch {
      // Good, doesn't exist
    }

    // Create symlink
    await fs.symlink(skillPath, linkPath);

    res.json({ success: true, message: 'Skill enabled' });
  } catch (error) {
    console.error('Error enabling skill:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/skills/disable/:name
 * Disable a skill by removing symlink
 */
router.delete('/disable/:name', async (req, res) => {
  try {
    const userUuid = req.user?.uuid;
    if (!userUuid) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const { name } = req.params;

    if (!SKILL_NAME_REGEX.test(name)) {
      return res.status(400).json({ error: 'Invalid skill name' });
    }

    const userPaths = getUserPaths(userUuid);
    const linkPath = path.join(userPaths.skillsDir, name);

    // Verify it's a symlink before removing
    try {
      const stat = await fs.lstat(linkPath);
      if (!stat.isSymbolicLink()) {
        return res.status(400).json({ error: 'Cannot disable non-symlink skill' });
      }
    } catch (err) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    await fs.unlink(linkPath);

    res.json({ success: true, message: 'Skill disabled' });
  } catch (error) {
    console.error('Error disabling skill:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/skills/:name
 * Delete a skill completely
 */
router.delete('/:name', async (req, res) => {
  try {
    const userUuid = req.user?.uuid;
    if (!userUuid) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const { name } = req.params;

    if (!SKILL_NAME_REGEX.test(name)) {
      return res.status(400).json({ error: 'Invalid skill name' });
    }

    const userPaths = getUserPaths(userUuid);
    const linkPath = path.join(userPaths.skillsDir, name);

    // Check the symlink target to determine source
    let realPath = null;
    let isImported = false;
    let isBuiltin = false;

    try {
      const stat = await fs.lstat(linkPath);
      if (stat.isSymbolicLink()) {
        realPath = await fs.realpath(linkPath);
        isImported = realPath.includes('/skills-import/');
        isBuiltin = isBuiltinSkillPath(realPath);
      }
    } catch (err) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    // Remove symlink
    await fs.unlink(linkPath);

    // If imported, also delete the actual files
    if (isImported && realPath) {
      try {
        await fs.rm(realPath, { recursive: true, force: true });
      } catch (err) {
        console.error('Error removing imported skill files:', err);
      }
    } else if (isBuiltin) {
      // Mark as removed so it won't be re-added on next sync
      await markBuiltinSkillRemoved(userUuid, name);
    }

    res.json({ success: true, message: 'Skill deleted' });
  } catch (error) {
    console.error('Error deleting skill:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/skills/import
 * Import a skill from zip file
 */
router.post('/import', upload.single('skillZip'), async (req, res) => {
  try {
    const userUuid = req.user?.uuid;
    if (!userUuid) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'ZIP file is required' });
    }

    const userPaths = getUserPaths(userUuid);

    // Extract zip
    const zip = new AdmZip(req.file.buffer);
    const zipEntries = zip.getEntries();

    if (zipEntries.length === 0) {
      return res.status(400).json({ error: 'ZIP file is empty' });
    }

    // Determine skill name from zip structure
    // Look for the root directory or first directory containing SKILLS.md
    let skillName = null;
    let rootDir = '';

    for (const entry of zipEntries) {
      if (entry.entryName.endsWith('SKILLS.md')) {
        const parts = entry.entryName.split('/');
        if (parts.length >= 2) {
          skillName = parts[0];
          rootDir = parts[0] + '/';
        } else {
          // SKILLS.md is at root, use original zip filename
          skillName = path.basename(req.file.originalname, '.zip');
        }
        break;
      }
    }

    if (!skillName) {
      // Fallback to first directory or zip filename
      const firstEntry = zipEntries.find(e => e.isDirectory);
      if (firstEntry) {
        skillName = firstEntry.entryName.replace(/\/$/, '').split('/')[0];
        rootDir = skillName + '/';
      } else {
        skillName = path.basename(req.file.originalname, '.zip');
      }
    }

    // Validate skill name
    if (!SKILL_NAME_REGEX.test(skillName)) {
      skillName = skillName.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100);
    }

    const importDir = path.join(userPaths.skillsImportDir, skillName);

    // Ensure import directory exists and is empty
    await fs.rm(importDir, { recursive: true, force: true });
    await fs.mkdir(importDir, { recursive: true });

    // Extract files
    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;

      let targetPath = entry.entryName;
      if (rootDir && targetPath.startsWith(rootDir)) {
        targetPath = targetPath.slice(rootDir.length);
      }

      if (!targetPath) continue;

      const fullPath = path.join(importDir, targetPath);
      const dir = path.dirname(fullPath);

      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, entry.getData());
    }

    // Create symlink in user's skills directory
    const linkPath = path.join(userPaths.skillsDir, skillName);

    // Remove existing symlink if any
    try {
      await fs.unlink(linkPath);
    } catch {
      // Ignore
    }

    await fs.symlink(importDir, linkPath);

    const metadata = await parseSkillMetadata(importDir);

    res.json({
      success: true,
      skill: {
        name: skillName,
        title: metadata.title,
        description: metadata.description,
        source: 'imported'
      }
    });
  } catch (error) {
    console.error('Error importing skill:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/skills/available
 * List all available skills from repositories
 */
router.get('/available', async (req, res) => {
  try {
    const userUuid = req.user?.uuid;
    if (!userUuid) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const userPaths = getUserPaths(userUuid);
    const publicPaths = getPublicPaths();

    const skills = [];

    // Get user's installed skills for comparison
    const installedSkills = new Set();
    try {
      const installed = await fs.readdir(userPaths.skillsDir);
      installed.forEach(s => installedSkills.add(s));
    } catch {
      // Ignore
    }

    // Scan user's repo symlinks
    try {
      await fs.mkdir(userPaths.skillsRepoDir, { recursive: true });
      const owners = await fs.readdir(userPaths.skillsRepoDir);

      for (const owner of owners) {
        if (owner.startsWith('.')) continue;

        const ownerPath = path.join(userPaths.skillsRepoDir, owner);
        const stat = await fs.stat(ownerPath);
        if (!stat.isDirectory()) continue;

        const repos = await fs.readdir(ownerPath);

        for (const repo of repos) {
          if (repo.startsWith('.')) continue;

          const repoPath = path.join(ownerPath, repo);
          let realRepoPath = repoPath;

          try {
            const repoStat = await fs.lstat(repoPath);
            if (repoStat.isSymbolicLink()) {
              realRepoPath = await fs.realpath(repoPath);
            }
          } catch {
            continue;
          }

          // Scan for skills in the repo
          const entries = await fs.readdir(realRepoPath, { withFileTypes: true });

          for (const entry of entries) {
            // Skip hidden dirs, READMEs, and files
            if (entry.name.startsWith('.') ||
                entry.name.toLowerCase().startsWith('readme') ||
                !entry.isDirectory()) {
              continue;
            }

            const skillPath = path.join(realRepoPath, entry.name);

            if (!await isValidSkill(skillPath)) {
              continue;
            }

            const metadata = await parseSkillMetadata(skillPath);

            skills.push({
              name: entry.name,
              title: metadata.title,
              description: metadata.description,
              repository: `${owner}/${repo}`,
              installed: installedSkills.has(entry.name),
              path: skillPath
            });
          }
        }
      }
    } catch (err) {
      console.error('Error scanning repos:', err);
    }

    res.json({ skills });
  } catch (error) {
    console.error('Error listing available skills:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/skills/install/:name
 * Install a skill from repository
 */
router.post('/install/:name', async (req, res) => {
  try {
    const userUuid = req.user?.uuid;
    if (!userUuid) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const { name } = req.params;
    const { skillPath } = req.body;

    if (!SKILL_NAME_REGEX.test(name)) {
      return res.status(400).json({ error: 'Invalid skill name' });
    }

    if (!skillPath) {
      return res.status(400).json({ error: 'Skill path is required' });
    }

    const userPaths = getUserPaths(userUuid);

    // Verify skill exists
    if (!await isValidSkill(skillPath)) {
      return res.status(404).json({ error: 'Skill not found or invalid' });
    }

    // Create symlink directly from user's skills directory to skill in repo
    const userSkillLink = path.join(userPaths.skillsDir, name);

    try {
      await fs.unlink(userSkillLink);
    } catch {
      // Ignore
    }

    await fs.symlink(skillPath, userSkillLink);

    const metadata = await parseSkillMetadata(skillPath);

    res.json({
      success: true,
      skill: {
        name,
        title: metadata.title,
        description: metadata.description,
        source: 'repo'
      }
    });
  } catch (error) {
    console.error('Error installing skill:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/skills/repos
 * List user's added skill repositories
 */
router.get('/repos', async (req, res) => {
  try {
    const userUuid = req.user?.uuid;
    if (!userUuid) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const userPaths = getUserPaths(userUuid);
    const repos = [];

    try {
      await fs.mkdir(userPaths.skillsRepoDir, { recursive: true });
      const owners = await fs.readdir(userPaths.skillsRepoDir);

      for (const owner of owners) {
        if (owner.startsWith('.')) continue;

        const ownerPath = path.join(userPaths.skillsRepoDir, owner);
        const stat = await fs.stat(ownerPath);
        if (!stat.isDirectory()) continue;

        const repoNames = await fs.readdir(ownerPath);

        for (const repo of repoNames) {
          if (repo.startsWith('.')) continue;

          const repoPath = path.join(ownerPath, repo);
          let realPath = repoPath;

          try {
            const repoStat = await fs.lstat(repoPath);
            if (repoStat.isSymbolicLink()) {
              realPath = await fs.realpath(repoPath);
            }
          } catch {
            continue;
          }

          // Count skills in repo
          let skillCount = 0;
          try {
            const entries = await fs.readdir(realPath, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.name.startsWith('.') || !entry.isDirectory()) continue;
              if (await isValidSkill(path.join(realPath, entry.name))) {
                skillCount++;
              }
            }
          } catch {
            // Ignore
          }

          repos.push({
            owner,
            repo,
            url: `https://github.com/${owner}/${repo}`,
            skillCount,
            path: realPath
          });
        }
      }
    } catch (err) {
      console.error('Error reading repos:', err);
    }

    res.json({ repos });
  } catch (error) {
    console.error('Error listing repos:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/skills/repos
 * Add (clone) a skill repository
 */
router.post('/repos', async (req, res) => {
  try {
    const userUuid = req.user?.uuid;
    if (!userUuid) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    let { url, branch = 'main' } = req.body;

    // Handle short format: owner/repo -> https://github.com/owner/repo
    if (url && !url.includes('://') && /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(url.trim())) {
      url = `https://github.com/${url.trim()}`;
    }

    // Validate URL
    const validation = validateGitUrl(url);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Parse owner/repo from URL
    const parsed = parseGitUrl(url);
    if (!parsed) {
      return res.status(400).json({ error: 'Could not parse repository URL' });
    }

    const { owner, repo } = parsed;
    const userPaths = getUserPaths(userUuid);
    const publicPaths = getPublicPaths();

    // Public repo path
    const publicRepoPath = path.join(publicPaths.skillsRepoDir, owner, repo);

    // Check if already cloned publicly
    let needsClone = true;
    try {
      await fs.access(publicRepoPath);
      needsClone = false;
      // Try to update
      try {
        await updateRepository(publicRepoPath);
      } catch (err) {
        console.log('Failed to update repo, using existing:', err.message);
      }
    } catch {
      // Need to clone
    }

    if (needsClone) {
      // Clone to public directory
      await fs.mkdir(path.dirname(publicRepoPath), { recursive: true });
      await cloneRepository(url, publicRepoPath);
    }

    // Create user symlink
    const userRepoPath = path.join(userPaths.skillsRepoDir, owner, repo);
    await fs.mkdir(path.dirname(userRepoPath), { recursive: true });

    try {
      await fs.unlink(userRepoPath);
    } catch {
      // Ignore
    }

    await fs.symlink(publicRepoPath, userRepoPath);

    // Count skills
    let skillCount = 0;
    try {
      const entries = await fs.readdir(publicRepoPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || !entry.isDirectory()) continue;
        if (await isValidSkill(path.join(publicRepoPath, entry.name))) {
          skillCount++;
        }
      }
    } catch {
      // Ignore
    }

    res.json({
      success: true,
      repo: {
        owner,
        repo,
        url,
        skillCount,
        path: publicRepoPath
      }
    });
  } catch (error) {
    console.error('Error adding repo:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/skills/repos/:owner/:repo
 * Remove a skill repository (user's symlink only)
 */
router.delete('/repos/:owner/:repo', async (req, res) => {
  try {
    const userUuid = req.user?.uuid;
    if (!userUuid) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const { owner, repo } = req.params;

    if (!owner || !repo) {
      return res.status(400).json({ error: 'Owner and repo are required' });
    }

    const userPaths = getUserPaths(userUuid);
    const userRepoPath = path.join(userPaths.skillsRepoDir, owner, repo);

    try {
      await fs.unlink(userRepoPath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Repository not found' });
      }
      throw err;
    }

    // Try to remove empty parent directory
    try {
      await fs.rmdir(path.dirname(userRepoPath));
    } catch {
      // Ignore - directory not empty
    }

    res.json({ success: true, message: 'Repository removed' });
  } catch (error) {
    console.error('Error removing repo:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
