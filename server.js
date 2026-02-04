#!/usr/bin/env node

/**
 * Claude CLI HTTP Server
 *
 * OpenAI-compatible HTTP API wrapper for Claude CLI.
 * Supports streaming, authentication, health checks, and graceful shutdown.
 *
 * @module server
 *
 * @example
 * node server.js
 *
 * @environment
 * PORT - Server port (default: 3912)
 * HOST - Server host (default: 0.0.0.0)
 * CLAUDE_BIN - Claude CLI binary path (default: claude)
 * API_KEY - Optional API key for authentication
 * LOG_LEVEL - Log level: debug, info, warn, error (default: info)
 * NODE_ENV - Environment: development, production (default: development)
 */

import express from 'express';
import { logger } from './lib/utils/index.js';
import openaiRoutes from './routes/openai.js';

// ============ Configuration ============
const config = {
  PORT: process.env.PORT || 3912,
  HOST: process.env.HOST || '0.0.0.0',
  CLAUDE_BIN: process.env.CLAUDE_BIN || 'claude',
  API_KEY: process.env.API_KEY || '',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  NODE_ENV: process.env.NODE_ENV || 'development'
};

// ============ Express App ============
const app = express();

// Body parsing middleware
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// ============ Routes ============

/**
 * Health check endpoint (no authentication required)
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'claude-cli-provider',
    version: '2.0.0',
    claude_bin: config.CLAUDE_BIN,
    auth_enabled: !!config.API_KEY,
    environment: config.NODE_ENV
  });
});

/**
 * OpenAI-compatible routes
 */
app.use('/v1', openaiRoutes);

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Not found',
      type: 'not_found_error'
    }
  });
});

/**
 * Global error handler
 */
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path
  });

  res.status(500).json({
    error: {
      message: config.NODE_ENV === 'development' ? err.message : 'Internal server error',
      type: 'internal_error'
    }
  });
});

// ============ Server Startup ============
const server = app.listen(config.PORT, config.HOST, () => {
  logger.info('✅ Claude CLI Provider Server started');
  logger.info(`   URL: http://${config.HOST}:${config.PORT}`);
  logger.info(`   Health: http://${config.HOST}:${config.PORT}/health`);
  logger.info(`   Environment: ${config.NODE_ENV}`);
  logger.info(`   Claude CLI: ${config.CLAUDE_BIN}`);
  logger.info(`   API Authentication: ${config.API_KEY ? 'enabled' : 'disabled'}`);
  logger.info(`   Log Level: ${config.LOG_LEVEL}`);

  if (!config.API_KEY && config.NODE_ENV === 'production') {
    logger.warn('⚠️  Running in production without API_KEY authentication!');
  }
});

// ============ Graceful Shutdown ============
/**
 * Graceful shutdown handler
 * @param {string} signal - Signal name
 */
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, shutting down gracefully...`);

  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason,
    promise
  });
});
