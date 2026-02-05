/**
 * OpenAI Compatible Routes
 *
 * Express router for OpenAI-compatible API endpoints.
 *
 * @example
 * import openaiRouter from './routes/openai.js';
 * app.use('/v1', openaiRouter);
 */

import express from 'express';
import { CLIAdapter } from '../lib/adapters/index.js';
import { logger, AuthenticationError, ValidationError, metrics } from '../lib/utils/index.js';

const router = express.Router();

/**
 * Create and configure CLI adapter instance
 * Initialized once and reused for all requests
 */
const createAdapter = () => {
  return new CLIAdapter({
    claudeBin: process.env.CLAUDE_BIN || 'claude',
    maxProcesses: parseInt(process.env.MAX_PROCESSES || '10', 10)
  });
};

/**
 * API Key authentication middleware
 */
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['authorization']?.replace('Bearer ', '') ||
                 req.headers['x-api-key'];

  if (!process.env.API_KEY) {
    // No API Key configured, skip authentication (dev mode)
    logger.debug('API Key not configured, skipping authentication');
    return next();
  }

  if (apiKey !== process.env.API_KEY) {
    logger.warn('Authentication failed', { ip: req.ip });
    return res.status(401).json({
      error: {
        message: 'Invalid API key',
        type: 'authentication_error'
      }
    });
  }

  logger.debug('Authentication successful');
  next();
}

/**
 * POST /v1/chat/completions
 * OpenAI-compatible chat completions endpoint
 */
router.post('/chat/completions', authenticateApiKey, async (req, res) => {
  const startTime = Date.now();

  try {
    const { messages, model, stream } = req.body;

    logger.info('Chat completion request', {
      model,
      messagesCount: messages?.length,
      stream
    });

    // Validate request
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Messages array is required and must not be empty',
          type: 'invalid_request_error'
        }
      });
    }

    // Create adapter and process request
    const adapter = createAdapter();
    const result = await adapter.processRequest({ messages, model, stream });

    if (result.type === 'stream' && result.generator) {
      // Handle streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        // Stream chunks from generator
        for await (const chunk of result.generator) {
          if (chunk.type === 'data') {
            res.write(`data: ${JSON.stringify(chunk.data)}\n\n`);
          } else if (chunk.type === 'done') {
            res.write('data: [DONE]\n\n');
            break;
          } else if (chunk.type === 'error') {
            res.write(`data: ${JSON.stringify(chunk.data)}\n\n`);
            res.write('data: [DONE]\n\n');
            break;
          }
        }

        res.end();

        const duration = Date.now() - startTime;
        metrics.recordRequest(duration, true, '/v1/chat/completions');
        logger.info('Streaming request completed', { duration });

      } catch (error) {
        logger.error('Streaming error', { error: error.message });
        metrics.recordRequest(Date.now() - startTime, false, '/v1/chat/completions');
        // Send error and close
        res.write(`data: ${JSON.stringify({
          error: {
            message: error.message,
            type: 'stream_error'
          }
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }

    } else if (result.type === 'response') {
      // Handle non-streaming response
      const duration = Date.now() - startTime;
      metrics.recordRequest(duration, true, '/v1/chat/completions');
      logger.info('Non-streaming request completed', { duration });

      res.json(result.data);
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    metrics.recordRequest(duration, false, '/v1/chat/completions');
    logger.error('Chat completion error', {
      error: error.message,
      duration
    });

    // Determine appropriate status code
    let statusCode = 500;
    let errorType = 'internal_error';

    if (error instanceof ValidationError) {
      statusCode = 400;
      errorType = 'invalid_request_error';
    } else if (error instanceof AuthenticationError) {
      statusCode = 401;
      errorType = 'authentication_error';
    }

    res.status(statusCode).json({
      error: {
        message: error.message,
        type: errorType
      }
    });
  }
});

/**
 * GET /v1/models
 * List available models
 */
router.get('/models', authenticateApiKey, (req, res) => {
  res.json({
    object: 'list',
    data: [
      { id: 'sonnet', name: 'Claude Sonnet (via CLI)' },
      { id: 'opus', name: 'Claude Opus (via CLI)' },
      { id: 'haiku', name: 'Claude Haiku (via CLI)' }
    ]
  });
});

export default router;
