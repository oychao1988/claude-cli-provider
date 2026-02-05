/**
 * Custom Error Classes
 *
 * Provides specific error types for better error handling and debugging.
 *
 * @example
 * import { ProcessError, ValidationError } from './lib/utils/errors.js';
 * throw new ProcessError('Claude CLI process failed', { exitCode: 1 });
 */

/**
 * Base error class for Claude CLI Provider
 * @extends Error
 */
class ClaudeCLIError extends Error {
  /**
   * Create a ClaudeCLIError
   * @param {string} message - Error message
   * @param {Object} details - Additional error details
   */
  constructor(message, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON-serializable object
   * @returns {Object} Error object with name, message, and details
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      details: this.details
    };
  }
}

/**
 * Error thrown when Claude CLI process fails
 * @extends ClaudeCLIError
 */
class ProcessError extends ClaudeCLIError {
  /**
   * Create a ProcessError
   * @param {string} message - Error message
   * @param {Object} details - Additional error details
   * @param {number} details.exitCode - Process exit code
   * @param {string} details.signal - Signal that terminated the process
   */
  constructor(message, details = {}) {
    super(message, details);
    this.name = 'ProcessError';
  }
}

/**
 * Error thrown when input validation fails
 * @extends ClaudeCLIError
 */
class ValidationError extends ClaudeCLIError {
  /**
   * Create a ValidationError
   * @param {string} message - Error message
   * @param {Object} details - Additional error details
   * @param {string[]} details.fields - Fields that failed validation
   */
  constructor(message, details = {}) {
    super(message, details);
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when authentication fails
 * @extends ClaudeCLIError
 */
class AuthenticationError extends ClaudeCLIError {
  /**
   * Create an AuthenticationError
   * @param {string} message - Error message
   * @param {Object} details - Additional error details
   */
  constructor(message, details = {}) {
    super(message, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when parsing Claude CLI output fails
 * @extends ClaudeCLIError
 */
class ParseError extends ClaudeCLIError {
  /**
   * Create a ParseError
   * @param {string} message - Error message
   * @param {Object} details - Additional error details
   * @param {string} details.rawOutput - Raw output that failed to parse
   */
  constructor(message, details = {}) {
    super(message, details);
    this.name = 'ParseError';
  }
}

/**
 * Error thrown when an adapter operation fails
 * @extends ClaudeCLIError
 */
class AdapterError extends ClaudeCLIError {
  /**
   * Create an AdapterError
   * @param {string} message - Error message
   * @param {Object} details - Additional error details
   * @param {string} details.adapterType - Type of adapter (cli, pty)
   */
  constructor(message, details = {}) {
    super(message, details);
    this.name = 'AdapterError';
  }
}

export {
  ClaudeCLIError,
  ProcessError,
  ValidationError,
  AuthenticationError,
  ParseError,
  AdapterError
};
