/**
 * Unified Logger Utility
 *
 * Provides consistent logging across the application with configurable log levels.
 * Supports structured logging with metadata.
 *
 * @example
 * import { logger } from './lib/utils/logger.js';
 * logger.info('Request received', { requestId: '123', path: '/v1/chat/completions' });
 */

/**
 * Logger class with multiple log levels
 */
class Logger {
  /**
   * Create a new Logger instance
   * @param {Object} config - Configuration object
   * @param {string} config.level - Log level (debug, info, warn, error)
   * @param {string} config.prefix - Optional prefix for all log messages
   */
  constructor(config = {}) {
    this.level = config.level || process.env.LOG_LEVEL || 'info';
    this.prefix = config.prefix || '';

    // Log level hierarchy
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
  }

  /**
   * Check if a log level should be output
   * @param {string} level - Log level to check
   * @returns {boolean} True if the level should be logged
   * @private
   */
  _shouldLog(level) {
    return this.levels[level] >= this.levels[this.level];
  }

  /**
   * Format log message with timestamp and prefix
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} meta - Optional metadata
   * @returns {string} Formatted log message
   * @private
   */
  _format(level, message, meta) {
    const timestamp = new Date().toISOString();
    const prefix = this.prefix ? `[${this.prefix}] ` : '';
    const metaStr = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level.toUpperCase()}] ${prefix}${message}${metaStr}`;
  }

  /**
   * Log debug message
   * @param {string} message - Log message
   * @param {Object} meta - Optional metadata
   */
  debug(message, meta = {}) {
    if (this._shouldLog('debug')) {
      console.error(this._format('debug', message, meta));
    }
  }

  /**
   * Log info message
   * @param {string} message - Log message
   * @param {Object} meta - Optional metadata
   */
  info(message, meta = {}) {
    if (this._shouldLog('info')) {
      console.error(this._format('info', message, meta));
    }
  }

  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {Object} meta - Optional metadata
   */
  warn(message, meta = {}) {
    if (this._shouldLog('warn')) {
      console.error(this._format('warn', message, meta));
    }
  }

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Object} meta - Optional metadata
   */
  error(message, meta = {}) {
    if (this._shouldLog('error')) {
      console.error(this._format('error', message, meta));
    }
  }
}

/**
 * Default logger instance
 */
const logger = new Logger();

export { Logger, logger };
