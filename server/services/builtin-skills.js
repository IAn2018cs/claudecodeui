import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUserPaths } from './user-directories.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to built-in skills directory
const BUILTIN_SKILLS_DIR = path.join(__dirname, '../builtin-skills');

// State file version for future migrations
const STATE_VERSION = 1;

/**
 * Get list of all available built-in skills
 */
export async function getBuiltinSkills() {
  const skills = [];

  try {
    const entries = await fs.readdir(BUILTIN_SKILLS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const skillPath = path.join(BUILTIN_SKILLS_DIR, entry.name);

        // Check for SKILLS.md or SKILL.md
        const skillsFile = path.join(skillPath, 'SKILLS.md');
        const skillFile = path.join(skillPath, 'SKILL.md');

        try {
          // Try SKILLS.md first, then SKILL.md
          let found = false;
          try {
            await fs.access(skillsFile);
            found = true;
          } catch {
            await fs.access(skillFile);
            found = true;
          }

          if (found) {
            skills.push({
              name: entry.name,
              path: skillPath
            });
          }
        } catch {
          // Skip if neither file exists
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Error reading builtin skills:', err);
    }
  }

  return skills;
}

/**
 * Get path to user's builtin skills state file
 */
function getStatePath(userUuid) {
  const userPaths = getUserPaths(userUuid);
  return path.join(userPaths.claudeDir, '.builtin-skills-state.json');
}

/**
 * Load user's builtin skills state
 */
export async function loadBuiltinSkillsState(userUuid) {
  try {
    const statePath = getStatePath(userUuid);
    const content = await fs.readFile(statePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {
      version: STATE_VERSION,
      removedSkills: []
    };
  }
}

/**
 * Save user's builtin skills state
 */
export async function saveBuiltinSkillsState(userUuid, state) {
  const statePath = getStatePath(userUuid);
  await fs.writeFile(statePath, JSON.stringify(state, null, 2));
}

/**
 * Initialize built-in skills for a user
 * Creates symlinks for all built-in skills not in user's removed list
 * Also cleans up dangling symlinks from deleted built-in skills
 */
export async function initBuiltinSkills(userUuid) {
  const userPaths = getUserPaths(userUuid);
  const builtinSkills = await getBuiltinSkills();
  const state = await loadBuiltinSkillsState(userUuid);
  // Clean up dangling symlinks pointing to removed built-in skills
  try {
    const entries = await fs.readdir(userPaths.skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(userPaths.skillsDir, entry.name);
      try {
        const stat = await fs.lstat(entryPath);
        if (!stat.isSymbolicLink()) continue;

        const target = await fs.readlink(entryPath);
        const realBuiltinDir = await fs.realpath(BUILTIN_SKILLS_DIR);
        const resolvedTarget = path.resolve(path.dirname(entryPath), target);

        // Only clean up symlinks that point into builtin-skills directory
        if (!resolvedTarget.startsWith(realBuiltinDir)) continue;

        // Check if the symlink target still exists
        try {
          await fs.access(resolvedTarget);
        } catch {
          // Target no longer exists, remove the dangling symlink
          await fs.unlink(entryPath);
          console.log(`Removed dangling builtin skill symlink: ${entry.name}`);
        }
      } catch (err) {
        // Ignore errors on individual entries
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Error cleaning up builtin skill symlinks:', err);
    }
  }

  // Create symlinks for new built-in skills
  for (const skill of builtinSkills) {
    // Skip if user has explicitly removed this skill
    if (state.removedSkills.includes(skill.name)) {
      continue;
    }

    const linkPath = path.join(userPaths.skillsDir, skill.name);

    try {
      // Check if link already exists
      await fs.lstat(linkPath);
      // Link exists, skip
    } catch {
      // Link doesn't exist, create it
      try {
        await fs.symlink(skill.path, linkPath);
        console.log(`Created builtin skill symlink: ${skill.name}`);
      } catch (err) {
        console.error(`Error creating builtin skill symlink ${skill.name}:`, err);
      }
    }
  }
}

/**
 * Mark a built-in skill as removed by user
 */
export async function markBuiltinSkillRemoved(userUuid, skillName) {
  const state = await loadBuiltinSkillsState(userUuid);

  if (!state.removedSkills.includes(skillName)) {
    state.removedSkills.push(skillName);
    await saveBuiltinSkillsState(userUuid, state);
  }
}

/**
 * Check if a path is a built-in skill
 */
export function isBuiltinSkillPath(realPath) {
  return realPath?.includes('/builtin-skills/') ?? false;
}

export { BUILTIN_SKILLS_DIR };
