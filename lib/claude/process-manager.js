/**
 * Claude Process Manager
 *
 * Manages Claude CLI process lifecycle for both CLI and PTY modes.
 * Handles process creation, cleanup, and health monitoring.
 *
 * @example
 * import ProcessManager from './lib/claude/process-manager.js';
 * const manager = new ProcessManager({ claudeBin: 'claude' });
 * const { process, processId } = manager.createCLIProcess({ model: 'sonnet' });
 */

import { spawn } from 'node:child_process';
import { logger, ProcessError } from '../utils/index.js';

/**
 * Process Manager for Claude CLI
 */
class ProcessManager {
  /**
   * Create a new ProcessManager
   * @param {Object} config - Configuration
   * @param {string} config.claudeBin - Path to Claude CLI binary (default: 'claude')
   * @param {number} config.maxProcesses - Maximum concurrent processes (default: 10)
   */
  constructor(config = {}) {
    this.claudeBin = config.claudeBin || process.env.CLAUDE_BIN || 'claude';
    this.maxProcesses = config.maxProcesses || 10;

    // Process pools
    this.cliProcesses = new Map();  // CLI mode processes
    this.ptyProcesses = new Map();  // PTY mode processes (future)

    logger.info('ProcessManager initialized', {
      claudeBin: this.claudeBin,
      maxProcesses: this.maxProcesses
    });
  }

  /**
   * Create a CLI mode process for OpenAI adapter
   * Uses -p flag for non-interactive, command-line argument mode
   *
   * @param {Object} options - Process options
   * @param {string} options.model - Model name (sonnet, opus, haiku)
   * @param {boolean} options.stream - Enable streaming output
   * @param {string} options.systemPrompt - Optional system prompt
   * @param {boolean} options.skipPermissions - Skip permission checks
   * @returns {Object} Process object with process and processId
   * @returns {ChildProcess} returns.process - Node.js ChildProcess
   * @returns {string} returns.processId - Unique process identifier
   *
   * @example
   * const { process, processId } = manager.createCLIProcess({
   *   model: 'sonnet',
   *   stream: true,
   *   systemPrompt: 'You are a helpful assistant'
   * });
   */
  createCLIProcess(options = {}) {
    // Check process pool limit
    if (this.cliProcesses.size >= this.maxProcesses) {
      throw new ProcessError('Maximum process limit reached', {
        limit: this.maxProcesses,
        current: this.cliProcesses.size
      });
    }

    const {
      model = 'sonnet',
      stream = true,
      systemPrompt = null,
      skipPermissions = true
    } = options;

    // Build CLI arguments
    const args = [
      '-p',                           // Print mode (non-interactive)
      '--output-format', stream ? 'stream-json' : 'json',
      '--verbose',                    // Required for stream-json
      ...(stream ? ['--include-partial-messages'] : []),
      '--no-session-persistence',     // Don't save sessions
      '--model', model,
      '--tools', '',                  // Disable tools for OpenAI mode
      ...(skipPermissions ? ['--dangerously-skip-permissions'] : [])
    ];

    // Add system prompt if provided
    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt);
    }

    logger.debug('Creating CLI process', {
      args: args.join(' '),
      model,
      stream
    });

    // Spawn the process
    let process;
    try {
      process = spawn(this.claudeBin, args, {
        env: process.env
      });
    } catch (error) {
      throw new ProcessError('Failed to spawn Claude CLI process', {
        error: error.message,
        claudeBin: this.claudeBin
      });
    }

    // Generate unique process ID
    const processId = this.generateId();

    // Store in process pool
    this.cliProcesses.set(processId, process);

    // Handle process exit
    process.on('exit', (code, signal) => {
      logger.debug('CLI process exited', {
        processId,
        code,
        signal
      });
      this.cliProcesses.delete(processId);
    });

    // Handle process error
    process.on('error', (error) => {
      logger.error('CLI process error', {
        processId,
        error: error.message
      });
      this.cliProcesses.delete(processId);
    });

    logger.info('CLI process created', {
      processId,
      pid: process.pid,
      model,
      activeProcesses: this.cliProcesses.size
    });

    return { process, processId };
  }

  /**
   * Create a PTY mode process for Agent adapter (future)
   * Will use node-pty for pseudo-terminal support
   *
   * @param {Object} options - Process options
   * @param {string} options.model - Model name
   * @param {Array<string>} options.allowedTools - List of allowed tools
   * @param {string} options.workingDirectory - Working directory
   * @returns {Object} Process object with ptyProcess and processId
   *
   * @example
   * const { ptyProcess, processId } = manager.createPTYProcess({
   *   model: 'sonnet',
   *   allowedTools: ['Bash', 'Write', 'Read']
   * });
   */
  createPTYProcess(options = {}) {
    // This will be implemented in Phase 3 with node-pty
    throw new ProcessError('PTY mode not yet implemented', {
      phase: 'Phase 3'
    });

    // Future implementation:
    // const pty = require('node-pty');
    // const args = ['--model', options.model];
    // if (options.allowedTools) {
    //   args.push('--allowed-tools', options.allowedTools.join(','));
    // }
    // const ptyProcess = pty.spawn(this.claudeBin, args, {
    //   name: 'xterm-color',
    //   cols: 80,
    //   rows: 24,
    //   cwd: options.workingDirectory,
    //   env: process.env
    // });
    // const processId = this.generateId();
    // this.ptyProcesses.set(processId, ptyProcess);
    // return { ptyProcess, processId };
  }

  /**
   * Clean up a specific process
   *
   * @param {string} processId - Process ID to clean up
   * @param {string} type - Process type ('cli' or 'pty')
   * @returns {boolean} True if process was found and cleaned up
   *
   * @example
   * const cleaned = manager.cleanup('proc_1234567890_abc123', 'cli');
   */
  cleanup(processId, type = 'cli') {
    const processes = type === 'cli' ? this.cliProcesses : this.ptyProcesses;
    const process = processes.get(processId);

    if (!process) {
      logger.warn('Process not found for cleanup', { processId, type });
      return false;
    }

    logger.debug('Cleaning up process', { processId, type });

    try {
      // Try graceful shutdown first
      process.kill('SIGTERM');

      // Force kill after 5 seconds
      setTimeout(() => {
        if (processes.has(processId)) {
          logger.warn('Force killing process', { processId });
          process.kill('SIGKILL');
        }
      }, 5000).unref();
    } catch (error) {
      logger.error('Error during process cleanup', {
        processId,
        error: error.message
      });
    }

    processes.delete(processId);
    logger.info('Process cleaned up', {
      processId,
      activeProcesses: processes.size
    });

    return true;
  }

  /**
   * Clean up all processes
   *
   * @param {string} type - Process type to clean ('cli', 'pty', or 'all')
   * @returns {number} Number of processes cleaned up
   *
   * @example
   * const count = manager.cleanupAll('cli');
   */
  cleanupAll(type = 'all') {
    let count = 0;

    if (type === 'cli' || type === 'all') {
      count += this.cliProcesses.size;
      this.cliProcesses.forEach((process, processId) => {
        try {
          process.kill('SIGTERM');
        } catch (error) {
          logger.error('Error killing CLI process', {
            processId,
            error: error.message
          });
        }
      });
      this.cliProcesses.clear();
    }

    if (type === 'pty' || type === 'all') {
      count += this.ptyProcesses.size;
      this.ptyProcesses.forEach((process, processId) => {
        try {
          process.kill('SIGTERM');
        } catch (error) {
          logger.error('Error killing PTY process', {
            processId,
            error: error.message
          });
        }
      });
      this.ptyProcesses.clear();
    }

    logger.info('All processes cleaned up', { count, type });
    return count;
  }

  /**
   * Get process by ID
   *
   * @param {string} processId - Process ID
   * @param {string} type - Process type ('cli' or 'pty')
   * @returns {ChildProcess|null} Process object or null
   *
   * @example
   * const process = manager.getProcess('proc_1234567890_abc123', 'cli');
   */
  getProcess(processId, type = 'cli') {
    const processes = type === 'cli' ? this.cliProcesses : this.ptyProcesses;
    return processes.get(processId) || null;
  }

  /**
   * Get current process pool statistics
   *
   * @returns {Object} Statistics object
   * @returns {number} returns.cliProcesses - Number of active CLI processes
   * @returns {number} returns.ptyProcesses - Number of active PTY processes
   * @returns {number} returns.total - Total active processes
   * @returns {number} returns.limit - Maximum allowed processes
   *
   * @example
   * const stats = manager.getStats();
   * // Returns: { cliProcesses: 2, ptyProcesses: 0, total: 2, limit: 10 }
   */
  getStats() {
    return {
      cliProcesses: this.cliProcesses.size,
      ptyProcesses: this.ptyProcesses.size,
      total: this.cliProcesses.size + this.ptyProcesses.size,
      limit: this.maxProcesses
    };
  }

  /**
   * Health check for all processes
   *
   * @returns {Object} Health status
   * @returns {boolean} returns.healthy - True if all processes are healthy
   * @returns {Object} returns.stats - Process statistics
   * @returns {Array<string>} returns.zombieProcesses - List of potentially zombie processes
   *
   * @example
   * const health = manager.healthCheck();
   */
  healthCheck() {
    const stats = this.getStats();
    const zombieProcesses = [];

    // Check CLI processes
    this.cliProcesses.forEach((process, processId) => {
      if (!process.pid || process.killed) {
        zombieProcesses.push(processId);
      }
    });

    // Check PTY processes
    this.ptyProcesses.forEach((process, processId) => {
      if (!process.pid || process.killed) {
        zombieProcesses.push(processId);
      }
    });

    const healthy = zombieProcesses.length === 0 && stats.total < stats.limit;

    return {
      healthy,
      stats,
      zombieProcesses
    };
  }

  /**
   * Generate unique process ID
   *
   * @returns {string} Unique process ID
   * @private
   */
  generateId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `proc_${timestamp}_${random}`;
  }

  /**
   * Graceful shutdown - clean up all processes
   * Called on server shutdown
   *
   * @returns {Promise<void>}
   *
   * @example
   * await manager.gracefulShutdown();
   */
  async gracefulShutdown() {
    logger.info('Starting graceful shutdown of all processes');

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn('Graceful shutdown timeout, forcing cleanup');
        this.cleanupAll('all');
        resolve();
      }, 10000);

      // Try graceful shutdown
      this.cleanupAll('all');

      // Wait a bit for processes to exit
      setTimeout(() => {
        clearTimeout(timeout);
        resolve();
      }, 1000);
    });
  }
}

export { ProcessManager };
