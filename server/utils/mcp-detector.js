/**
 * MCP SERVER DETECTION UTILITY
 * ============================
 *
 * Centralized utility for detecting MCP server configurations.
 * Used across MCP-dependent features.
 */

import { promises as fsPromises } from 'fs';
import path from 'path';
import { getUserPaths } from '../services/user-directories.js';

/**
 * Get all configured MCP servers for a specific user
 * @param {string} userUuid - User UUID (required)
 * @returns {Promise<Object>} All MCP servers configuration
 */
export async function getAllMCPServers(userUuid) {
    if (!userUuid) {
        return {
            hasConfig: false,
            error: 'userUuid is required',
            servers: {},
            projectServers: {}
        };
    }

    try {
        const userPaths = getUserPaths(userUuid);
        const configPaths = [
            userPaths.claudeJson,
            path.join(userPaths.claudeDir, 'settings.json')
        ];

        let configData = null;
        let configPath = null;

        // Try to read from either config file
        for (const filepath of configPaths) {
            try {
                const fileContent = await fsPromises.readFile(filepath, 'utf8');
                configData = JSON.parse(fileContent);
                configPath = filepath;
                break;
            } catch (error) {
                continue;
            }
        }

        if (!configData) {
            return {
                hasConfig: false,
                servers: {},
                projectServers: {}
            };
        }

        return {
            hasConfig: true,
            configPath,
            servers: configData.mcpServers || {},
            projectServers: configData.projects || {}
        };
    } catch (error) {
        console.error('Error getting all MCP servers:', error);
        return {
            hasConfig: false,
            error: error.message,
            servers: {},
            projectServers: {}
        };
    }
}
