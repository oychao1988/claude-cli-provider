/**
 * PTY Adapter
 *
 * Adapts Agent mode requests to Claude CLI interactive mode using PTY.
 * Supports full Claude CLI functionality including tool calls.
 *
 * @example
 * import { PTYAdapter } from './lib/adapters/pty-adapter.js';
 * const adapter = new PTYAdapter({ claudeBin: 'claude' });
 * const stream = await adapter.sendMessage(sessionId, 'Hello');
 */

import { ProcessManager } from '../claude/process-manager.js';
import { SessionManager } from '../claude/session-manager.js';
import { ScreenParser } from '../claude/screen-parser.js';
import { logger, AdapterError } from '../utils/index.js';

/**
 * PTY Adapter for Agent mode
 */
export class PTYAdapter {
  /**
   * Create a new PTYAdapter
   * @param {Object} config - Configuration
   * @param {string} config.claudeBin - Path to Claude CLI binary
   * @param {number} config.maxProcesses - Maximum concurrent processes
   */
  constructor(config = {}) {
    this.claudeBin = config.claudeBin || process.env.CLAUDE_BIN || 'claude';
    this.processManager = new ProcessManager({
      claudeBin: this.claudeBin,
      maxProcesses: config.maxProcesses
    });
    this.sessionManager = new SessionManager();

    logger.info('PTYAdapter initialized', {
      claudeBin: this.claudeBin
    });
  }

  /**
   * Create or get a session
   *
   * @param {string|null} sessionId - Existing session ID or null for new session
   * @param {Object} options - Session options
   * @returns {Promise<Object>} Session object
   *
   * @example
   * const session = await ptyAdapter.getOrCreateSession(null, {
   *   model: 'sonnet',
   *   allowedTools: ['Bash', 'Write']
   * });
   */
  async getOrCreateSession(sessionId, options = {}) {
    // If sessionId provided, try to get existing session
    if (sessionId) {
      const session = this.sessionManager.getSession(sessionId);
      if (session) {
        logger.debug('Using existing session', { sessionId });
        return session;
      }

      logger.warn('Session not found, creating new one', { sessionId });
    }

    // Create new session
    const session = this.sessionManager.createSession(options);

    // Create PTY process
    const { ptyProcess, processId } = await this.processManager.createPTYProcess({
      model: options.model || 'sonnet',
      allowedTools: options.allowedTools || null,
      workingDirectory: options.workingDirectory
    });

    // Associate PTY process with session
    this.sessionManager.setPTYProcess(session.sessionId, ptyProcess, processId);

    // Wait for initial prompt
    await this.waitForPrompt(session.sessionId);

    this.sessionManager.updateStatus(session.sessionId, 'ready');

    logger.info('Session ready', {
      sessionId: session.sessionId,
      processId
    });

    return session;
  }

  /**
   * Send message to PTY session
   *
   * @param {string} sessionId - Session ID
   * @param {string} content - Message content
   * @returns {Promise<void>}
   *
   * @example
   * await ptyAdapter.sendMessage('uuid', 'List all files');
   */
  async sendMessage(sessionId, content) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new AdapterError('Session not found', { sessionId });
    }

    if (!session.ptyProcess) {
      throw new AdapterError('Session has no PTY process', { sessionId });
    }

    // Add user message to session history
    this.sessionManager.addMessage(sessionId, {
      role: 'user',
      content
    });

    // Update session status
    this.sessionManager.updateStatus(sessionId, 'processing');

    // Send message using bracketed paste mode
    try {
      const pty = session.ptyProcess;

      // Enable bracketed paste mode
      pty.write('\x1b[200~');

      // Send content
      pty.write(content);

      // Disable bracketed paste mode
      pty.write('\x1b[201~');

      // Send Enter
      pty.write('\r');

      logger.debug('Message sent to PTY', {
        sessionId,
        contentLength: content.length
      });
    } catch (error) {
      this.sessionManager.updateStatus(sessionId, 'error');
      throw new AdapterError('Failed to send message to PTY', {
        sessionId,
        error: error.message
      });
    }
  }

  /**
   * Stream response from PTY session
   *
   * @param {string} sessionId - Session ID
   * @returns {AsyncGenerator} Async generator yielding SSE events
   *
   * @example
   * for await (const event of ptyAdapter.streamResponse('uuid')) {
   *   console.log(event.type, event.data);
   * }
   */
  async *streamResponse(sessionId) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new AdapterError('Session not found', { sessionId });
    }

    if (!session.ptyProcess) {
      throw new AdapterError('Session has no PTY process', { sessionId });
    }

    const pty = session.ptyProcess;
    let screenBuffer = '';
    let lastScreen = '';
    let stableCount = 0;
    let lastEmittedContent = '';

    // Create data handler reference to allow cleanup
    const dataHandler = (data) => {
      screenBuffer += data;
      this.sessionManager.updateScreen(sessionId, screenBuffer);
    };

    // Maximum stream duration to prevent infinite loops
    const MAX_STREAM_DURATION = 30000; // 30 seconds
    const startTime = Date.now();

    try {
      // Listen to PTY output
      pty.on('data', dataHandler);

      // Stream until screen is stable or timeout
      while (stableCount < 3) {
        // Check for timeout
        if (Date.now() - startTime > MAX_STREAM_DURATION) {
          logger.warn('Stream response timeout', {
            sessionId,
            duration: Date.now() - startTime
          });
          yield {
            type: 'warning',
            data: {
              message: 'Response timed out but may still be processing',
              timestamp: new Date().toISOString()
            }
          };
          break;
        }

        // Wait a bit for new data
        await new Promise(resolve => setTimeout(resolve, 100));

        const currentScreen = screenBuffer;

        // Check for new content
        if (currentScreen !== lastScreen) {
          const analysis = ScreenParser.analyzeScreen(
            currentScreen,
            lastEmittedContent
          );

          // Emit content events
          if (analysis.content && analysis.content !== lastEmittedContent) {
            const newContent = analysis.content.substring(lastEmittedContent.length);
            if (newContent.trim()) {
              yield {
                type: 'content',
                data: {
                  content: newContent,
                  timestamp: new Date().toISOString()
                }
              };
              lastEmittedContent = analysis.content;
            }
          }

          // Emit tool call events
          if (analysis.toolCalls.length > 0) {
            for (const toolCall of analysis.toolCalls) {
              yield {
                type: 'tool_call',
                data: {
                  tool: toolCall.tool,
                  input: toolCall.input,
                  timestamp: new Date().toISOString()
                }
              };
            }
          }

          // Check if screen is stable
          if (ScreenParser.isScreenStable(lastScreen, currentScreen, 0.95)) {
            stableCount++;
            logger.debug('Screen stable', { sessionId, stableCount });
          } else {
            stableCount = 0;
          }

          lastScreen = currentScreen;
        }
      }

      // Final screen analysis
      const finalAnalysis = ScreenParser.analyzeScreen(screenBuffer);

      // Add assistant message to session history
      if (finalAnalysis.content) {
        this.sessionManager.addMessage(sessionId, {
          role: 'assistant',
          content: finalAnalysis.content
        });
      }

      // Emit done event
      yield {
        type: 'done',
        data: {
          status: finalAnalysis.status,
          timestamp: new Date().toISOString()
        }
      };

      // Update session status
      this.sessionManager.updateStatus(sessionId, 'ready');

      logger.info('Response completed', {
        sessionId,
        contentLength: finalAnalysis.content?.length || 0,
        toolCalls: finalAnalysis.toolCalls.length
      });

    } catch (error) {
      this.sessionManager.updateStatus(sessionId, 'error');
      throw new AdapterError('Error streaming PTY response', {
        sessionId,
        error: error.message
      });
    } finally {
      // Always remove the data listener to prevent memory leaks
      pty.off('data', dataHandler);
      logger.debug('PTY data listener removed', { sessionId });
    }
  }

  /**
   * Wait for initial prompt from PTY
   *
   * @param {string} sessionId - Session ID
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<void>}
   * @private
   */
  async waitForPrompt(sessionId, timeout = 30000) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new AdapterError('Session not found', { sessionId });
    }

    const startTime = Date.now();
    let screenBuffer = '';

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        session.ptyProcess.off('data', onData);
        reject(new AdapterError('Timeout waiting for prompt', {
          sessionId,
          screenLength: screenBuffer.length
        }));
      }, timeout);

      const onData = (data) => {
        screenBuffer += data;
        this.sessionManager.updateScreen(sessionId, screenBuffer);

        // Improved prompt detection
        const lines = screenBuffer.split('\n');
        const lastLine = lines[lines.length - 1].trim();

        // Check if last line is a prompt marker
        // Claude CLI prompt is typically "> " at the end of output
        const isPrompt = lastLine === '>' ||
                        (lastLine.endsWith('>') && lastLine.length < 10);

        if (isPrompt) {
          clearTimeout(timeoutId);
          session.ptyProcess.off('data', onData);
          logger.debug('Prompt detected', {
            sessionId,
            lastLine,
            duration: Date.now() - startTime
          });
          resolve();
        }
      };

      session.ptyProcess.on('data', onData);
    });
  }

  /**
   * Get session list
   *
   * @returns {Array<Object>} Array of session summaries
   *
   * @example
   * const sessions = ptyAdapter.listSessions();
   */
  listSessions() {
    return this.sessionManager.listSessions();
  }

  /**
   * Get session details
   *
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session details
   *
   * @example
   * const session = ptyAdapter.getSession('uuid');
   */
  getSession(sessionId) {
    return this.sessionManager.getSessionDetails(sessionId);
  }

  /**
   * Delete a session
   *
   * @param {string} sessionId - Session ID
   * @returns {boolean} True if session was deleted
   *
   * @example
   * const deleted = ptyAdapter.deleteSession('uuid');
   */
  deleteSession(sessionId) {
    const session = this.sessionManager.getSession(sessionId);
    if (session && session.processId) {
      this.processManager.cleanup(session.processId, 'pty');
    }

    return this.sessionManager.deleteSession(sessionId);
  }

  /**
   * Health check
   *
   * @returns {Object} Health status
   */
  healthCheck() {
    const processStats = this.processManager.getStats();
    const sessionStats = this.sessionManager.getStats();

    return {
      adapter: 'pty',
      healthy: processStats.total < processStats.limit,
      processes: processStats,
      sessions: sessionStats
    };
  }

  /**
   * Clean up resources
   * Called on adapter shutdown
   */
  async cleanup() {
    logger.info('PTYAdapter cleaning up');

    // Clean up all sessions
    this.sessionManager.cleanupAll();

    // Clean up process manager
    await this.processManager.gracefulShutdown();
  }
}
