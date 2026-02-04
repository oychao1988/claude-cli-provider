/**
 * Agent Mode Routes
 *
 * Provides Agent mode API endpoints for full Claude CLI functionality.
 * Supports tool calls, session management, and streaming responses.
 *
 * @module routes/agent
 */

import express from 'express';
import { PTYAdapter } from '../lib/adapters/index.js';
import { logger } from '../lib/utils/index.js';

const router = express.Router();

// Create global PTY adapter instance
const ptyAdapter = new PTYAdapter({
  claudeBin: process.env.CLAUDE_BIN || 'claude',
  maxProcesses: parseInt(process.env.MAX_PTY_PROCESSES || '5', 10)
});

/**
 * POST /v1/agent/chat
 *
 * Send a message to Claude and stream the response
 * Supports tool calls and maintains session context
 *
 * @example
 * POST /v1/agent/chat
 * {
 *   "content": "List all files in current directory",
 *   "session_id": "optional-session-id",
 *   "options": {
 *     "model": "sonnet",
 *     "allowedTools": ["Bash", "Write", "Read"]
 *   }
 * }
 */
router.post('/chat', async (req, res) => {
  const { content, session_id, options } = req.body;

  // Validate request
  if (!content || typeof content !== 'string') {
    return res.status(400).json({
      error: {
        message: 'Content is required and must be a string',
        type: 'invalid_request_error'
      }
    });
  }

  logger.info('Agent chat request', {
    contentLength: content.length,
    sessionId: session_id,
    options
  });

  try {
    // Create or get session
    const session = await ptyAdapter.getOrCreateSession(session_id, options || {});

    // Send message
    await ptyAdapter.sendMessage(session.sessionId, content);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send session ID in first event
    res.write(`event: session\ndata: ${JSON.stringify({ session_id: session.sessionId })}\n\n`);

    // Stream response
    for await (const event of ptyAdapter.streamResponse(session.sessionId)) {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event.data)}\n\n`);
    }

    // Send final done event
    res.write('event: done\n');
    res.write(`data: ${JSON.stringify({})}\n\n`);
    res.end();

    logger.info('Agent chat completed', {
      sessionId: session.sessionId
    });

  } catch (error) {
    logger.error('Agent chat error', {
      error: error.message,
      stack: error.stack
    });

    // If headers haven't been sent yet, send error response
    if (!res.headersSent) {
      res.status(500).json({
        error: {
          message: error.message,
          type: 'agent_error'
        }
      });
    } else {
      // Otherwise, send error as SSE event
      res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
      res.end();
    }
  }
});

/**
 * GET /v1/agent/sessions
 *
 * List all active sessions
 *
 * @example
 * GET /v1/agent/sessions
 */
router.get('/sessions', (req, res) => {
  try {
    const sessions = ptyAdapter.listSessions();
    res.json({ sessions });
  } catch (error) {
    logger.error('List sessions error', {
      error: error.message
    });
    res.status(500).json({
      error: {
        message: 'Failed to list sessions',
        type: 'server_error'
      }
    });
  }
});

/**
 * GET /v1/agent/sessions/:id
 *
 * Get session details
 *
 * @example
 * GET /v1/agent/sessions/uuid
 */
router.get('/sessions/:id', (req, res) => {
  try {
    const session = ptyAdapter.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({
        error: {
          message: 'Session not found',
          type: 'not_found_error'
        }
      });
    }
    res.json(session);
  } catch (error) {
    logger.error('Get session error', {
      error: error.message,
      sessionId: req.params.id
    });
    res.status(500).json({
      error: {
        message: 'Failed to get session',
        type: 'server_error'
      }
    });
  }
});

/**
 * DELETE /v1/agent/sessions/:id
 *
 * Delete a session
 *
 * @example
 * DELETE /v1/agent/sessions/uuid
 */
router.delete('/sessions/:id', (req, res) => {
  try {
    const deleted = ptyAdapter.deleteSession(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        error: {
          message: 'Session not found',
          type: 'not_found_error'
        }
      });
    }
    res.json({ ok: true, message: 'Session deleted' });
  } catch (error) {
    logger.error('Delete session error', {
      error: error.message,
      sessionId: req.params.id
    });
    res.status(500).json({
      error: {
        message: 'Failed to delete session',
        type: 'server_error'
      }
    });
  }
});

/**
 * GET /v1/agent/health
 *
 * Health check for Agent mode
 *
 * @example
 * GET /v1/agent/health
 */
router.get('/health', (req, res) => {
  try {
    const health = ptyAdapter.healthCheck();
    res.json({
      status: 'ok',
      service: 'agent-mode',
      ...health
    });
  } catch (error) {
    logger.error('Health check error', {
      error: error.message
    });
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * Cleanup handler for graceful shutdown
 */
export const cleanup = async () => {
  logger.info('Cleaning up Agent routes');
  await ptyAdapter.cleanup();
};

export default router;
