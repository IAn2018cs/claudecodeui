/**
 * MCP UTILITIES API ROUTES
 * ========================
 *
 * API endpoints for MCP server detection and configuration utilities.
 * These endpoints expose centralized MCP detection functionality.
 */

import express from 'express';
import { getAllMCPServers } from '../utils/mcp-detector.js';

const router = express.Router();

/**
 * GET /api/mcp-utils/all-servers
 * Get all configured MCP servers for the current user
 */
router.get('/all-servers', async (req, res) => {
    try {
        const userUuid = req.user?.uuid;
        if (!userUuid) {
            return res.status(401).json({
                error: 'User authentication required'
            });
        }
        const result = await getAllMCPServers(userUuid);
        res.json(result);
    } catch (error) {
        console.error('MCP servers detection error:', error);
        res.status(500).json({
            error: 'Failed to get MCP servers',
            message: error.message
        });
    }
});

export default router;
