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
import AGENT_CONFIG from '../lib/config/agent-config.js';

const router = express.Router();

// Create global PTY adapter instance
const ptyAdapter = new PTYAdapter({
  claudeBin: process.env.CLAUDE_BIN || 'claude',
  maxProcesses: AGENT_CONFIG.process.MAX_PROCESSES
});

// Log configuration on startup
logger.info('[Route] Agent routes initialized', {
  config: {
    timeouts: AGENT_CONFIG.timeouts,
    screen: AGENT_CONFIG.screen,
    process: AGENT_CONFIG.process
  }
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
  const requestStartTime = Date.now();
  const { content, session_id, options } = req.body;

  // Validate request
  if (!content || typeof content !== 'string') {
    logger.warn('[Route] Invalid request: missing or invalid content', {
      contentType: typeof content,
      body: req.body
    });
    return res.status(400).json({
      error: {
        message: 'Content is required and must be a string',
        type: 'invalid_request_error'
      }
    });
  }

  logger.info('[Route] Agent chat request received', {
    contentLength: content.length,
    contentPreview: content.substring(0, 100),
    sessionId: session_id,
    options,
    ip: req.ip
  });

  // Handle client disconnect
  req.on('close', () => {
    logger.info('[Route] Client disconnected', {
      sessionId: session_id || 'unknown',
      duration: Date.now() - requestStartTime
    });
  });

  try {
    // Create or get session
    logger.debug('[Route] Getting or creating session', {
      existingSessionId: session_id
    });
    const session = await ptyAdapter.getOrCreateSession(session_id, options || {});
    logger.info('[Route] Session ready', {
      sessionId: session.sessionId,
      isNew: !session_id
    });

    // Send message
    logger.debug('[Route] Sending message to session', {
      sessionId: session.sessionId
    });
    await ptyAdapter.sendMessage(session.sessionId, content);
    logger.info('[Route] Message sent, starting stream', {
      sessionId: session.sessionId
    });

    // Set SSE headers with additional stability settings
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Send session ID in first event
    res.write(`event: session\ndata: ${JSON.stringify({ session_id: session.sessionId })}\n\n`);
    logger.debug('[Route] Session event sent', {
      sessionId: session.sessionId
    });

    // Flush immediately to send headers
    if (res.flush) {
      res.flush();
    }

    let eventCount = 0;
    let lastEventTime = Date.now();
    const streamStartTime = Date.now();
    const HEARTBEAT_INTERVAL = AGENT_CONFIG.timeouts.HEARTBEAT;

    // Set up heartbeat to keep connection alive
    const heartbeatInterval = setInterval(() => {
      if (res.writable) {
        const elapsed = Date.now() - lastEventTime;
        if (elapsed > HEARTBEAT_INTERVAL) {
          logger.debug('[Route] Sending heartbeat', {
            sessionId: session.sessionId,
            elapsedSinceLastEvent: elapsed
          });
          res.write(`: heartbeat\n\n`);
          lastEventTime = Date.now();
        }
      }
    }, HEARTBEAT_INTERVAL);

    try {
      // Stream response
      for await (const event of ptyAdapter.streamResponse(session.sessionId)) {
        // Check if client is still connected
        if (!res.writable || res.closed) {
          logger.warn('[Route] Client no longer writable', {
            sessionId: session.sessionId
          });
          break;
        }

        eventCount++;
        lastEventTime = Date.now();

        if (event.type === 'content') {
          logger.debug('[Route] Streaming content', {
            sessionId: session.sessionId,
            eventNumber: eventCount,
            contentLength: event.data.content?.length || 0
          });
        } else if (event.type === 'tool_call') {
          logger.info('[Route] Streaming tool call', {
            sessionId: session.sessionId,
            tool: event.data.tool
          });
        } else if (event.type === 'warning') {
          logger.warn('[Route] Stream warning', {
            sessionId: session.sessionId,
            message: event.data.message
          });
        }

        // Write event with error handling
        try {
          res.write(`event: ${event.type}\n`);
          res.write(`data: ${JSON.stringify(event.data)}\n\n`);

          // Flush after each event to ensure immediate delivery
          if (res.flush) {
            res.flush();
          }
        } catch (writeError) {
          logger.error('[Route] Error writing to response', {
            sessionId: session.sessionId,
            error: writeError.message,
            eventCount
          });
          break;
        }
      }
    } finally {
      // Clear heartbeat interval
      clearInterval(heartbeatInterval);
    }

    const streamDuration = Date.now() - streamStartTime;

    // Send final done event if still writable
    if (res.writable && !res.closed) {
      try {
        res.write('event: done\n');
        res.write(`data: ${JSON.stringify({})}\n\n`);
        if (res.flush) {
          res.flush();
        }
      } catch (finalWriteError) {
        logger.warn('[Route] Error writing final event', {
          sessionId: session.sessionId,
          error: finalWriteError.message
        });
      }
    }

    // End response
    try {
      res.end();
    } catch (endError) {
      // Response might already be ended
      logger.debug('[Route] Error ending response (may be normal)', {
        sessionId: session.sessionId,
        error: endError.message
      });
    }

    logger.info('[Route] Agent chat completed', {
      sessionId: session.sessionId,
      totalDuration: Date.now() - requestStartTime,
      streamDuration,
      eventCount,
      clientDisconnected: res.closed
    });

  } catch (error) {
    const errorDuration = Date.now() - requestStartTime;

    logger.error('[Route] Agent chat error', {
      error: error.message,
      stack: error.stack,
      sessionId: session_id,
      duration: errorDuration,
      headersSent: res.headersSent,
      responseClosed: res.closed
    });

    // If headers haven't been sent yet, send error response
    if (!res.headersSent) {
      res.status(500).json({
        error: {
          message: error.message,
          type: 'agent_error',
          duration: errorDuration
        }
      });
    } else if (res.writable && !res.closed) {
      // Otherwise, send error as SSE event
      try {
        res.write(`event: error\ndata: ${JSON.stringify({
          message: error.message,
          duration: errorDuration
        })}\n\n`);
        res.end();
      } catch (sseError) {
        logger.error('[Route] Error sending SSE error event', {
          error: sseError.message
        });
      }
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
