/**
 * Session Manager
 *
 * Manages PTY sessions for Agent mode.
 * Handles session lifecycle, message history, and cleanup.
 *
 * @example
 * import { SessionManager } from './lib/claude/session-manager.js';
 * const manager = new SessionManager();
 * const session = manager.createSession({ model: 'sonnet' });
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/index.js';

/**
 * Session Manager for PTY sessions
 */
export class SessionManager {
  /**
   * Create a new SessionManager
   */
  constructor() {
    this.sessions = new Map();
    this.cleanupInterval = null;

    // Start periodic cleanup
    this.startPeriodicCleanup();

    logger.info('SessionManager initialized');
  }

  /**
   * Create a new session
   *
   * @param {Object} options - Session options
   * @param {string} options.model - Model name
   * @param {Array<string>} options.allowedTools - Allowed tools
   * @param {string} options.workingDirectory - Working directory
   * @returns {Object} Session object
   *
   * @example
   * const session = sessionManager.createSession({
   *   model: 'sonnet',
   *   allowedTools: ['Bash', 'Write', 'Read']
   * });
   */
  createSession(options = {}) {
    const sessionId = uuidv4();
    const session = {
      sessionId,
      createdAt: new Date(),
      lastActivity: new Date(),
      status: 'initializing',
      messages: [],
      ptyProcess: null,
      screenHistory: [],
      currentScreen: '',
      lastScreen: '',
      processId: null,
      options: {
        model: options.model || 'sonnet',
        allowedTools: options.allowedTools || null,
        workingDirectory: options.workingDirectory || process.cwd()
      }
    };

    this.sessions.set(sessionId, session);

    logger.info('Session created', {
      sessionId,
      model: session.options.model,
      allowedTools: session.options.allowedTools
    });

    return session;
  }

  /**
   * Get a session by ID
   *
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session object or null
   *
   * @example
   * const session = sessionManager.getSession('uuid');
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Update session status
   *
   * @param {string} sessionId - Session ID
   * @param {string} status - New status
   * @returns {boolean} True if session was found and updated
   *
   * @example
   * sessionManager.updateStatus('uuid', 'ready');
   */
  updateStatus(sessionId, status) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn('Session not found for status update', { sessionId, status });
      return false;
    }

    const oldStatus = session.status;
    session.status = status;
    session.lastActivity = new Date();

    logger.debug('Session status updated', {
      sessionId,
      oldStatus,
      newStatus: status
    });

    return true;
  }

  /**
   * Associate PTY process with session
   *
   * @param {string} sessionId - Session ID
   * @param {Object} ptyProcess - PTY process object
   * @param {string} processId - Process ID
   * @returns {boolean} True if successful
   *
   * @example
   * sessionManager.setPTYProcess('uuid', ptyProcess, 'proc_123');
   */
  setPTYProcess(sessionId, ptyProcess, processId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn('Session not found for PTY process', { sessionId });
      return false;
    }

    session.ptyProcess = ptyProcess;
    session.processId = processId;
    session.lastActivity = new Date();

    logger.debug('PTY process associated with session', {
      sessionId,
      processId
    });

    return true;
  }

  /**
   * Add message to session history
   *
   * @param {string} sessionId - Session ID
   * @param {Object} message - Message object
   * @returns {Object|null} Added message or null
   *
   * @example
   * const msg = sessionManager.addMessage('uuid', {
   *   role: 'user',
   *   content: 'Hello'
   * });
   */
  addMessage(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn('Session not found for message', { sessionId });
      return null;
    }

    const msg = {
      id: session.messages.length + 1,
      ...message,
      timestamp: new Date()
    };

    session.messages.push(msg);
    session.lastActivity = new Date();

    logger.debug('Message added to session', {
      sessionId,
      messageId: msg.id,
      role: msg.role
    });

    return msg;
  }

  /**
   * Update screen history for session
   *
   * @param {string} sessionId - Session ID
   * @param {string} screen - Current screen content
   * @returns {boolean} True if successful
   *
   * @example
   * sessionManager.updateScreen('uuid', screenContent);
   */
  updateScreen(sessionId, screen) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn('Session not found for screen update', { sessionId });
      return false;
    }

    session.lastScreen = session.currentScreen;
    session.currentScreen = screen;
    session.lastActivity = new Date();

    // Keep only last 10 screens in history
    session.screenHistory.push(screen);
    if (session.screenHistory.length > 10) {
      session.screenHistory.shift();
    }

    return true;
  }

  /**
   * Delete a session
   *
   * @param {string} sessionId - Session ID
   * @returns {boolean} True if session was found and deleted
   *
   * @example
   * const deleted = sessionManager.deleteSession('uuid');
   */
  deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn('Session not found for deletion', { sessionId });
      return false;
    }

    // Kill PTY process if it exists
    if (session.ptyProcess) {
      try {
        session.ptyProcess.kill('SIGTERM');
        logger.debug('PTY process killed', { sessionId });
      } catch (error) {
        logger.error('Error killing PTY process', {
          sessionId,
          error: error.message
        });
      }
    }

    const deleted = this.sessions.delete(sessionId);

    if (deleted) {
      logger.info('Session deleted', {
        sessionId,
        messageCount: session.messages.length
      });
    }

    return deleted;
  }

  /**
   * List all sessions
   *
   * @returns {Array<Object>} Array of session summaries
   *
   * @example
   * const sessions = sessionManager.listSessions();
   */
  listSessions() {
    return Array.from(this.sessions.values()).map(session => ({
      session_id: session.sessionId,
      created_at: session.createdAt,
      last_activity: session.lastActivity,
      message_count: session.messages.length,
      status: session.status,
      model: session.options.model,
      has_pty_process: !!session.ptyProcess
    }));
  }

  /**
   * Get session details
   *
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session details or null
   *
   * @example
   * const details = sessionManager.getSessionDetails('uuid');
   */
  getSessionDetails(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      session_id: session.sessionId,
      created_at: session.createdAt,
      last_activity: session.lastActivity,
      status: session.status,
      message_count: session.messages.length,
      messages: session.messages,
      options: session.options,
      has_pty_process: !!session.ptyProcess,
      process_id: session.processId,
      screen_length: session.currentScreen?.length || 0
    };
  }

  /**
   * Clean up expired sessions
   *
   * @param {number} maxAge - Maximum age in milliseconds (default: 24 hours)
   * @returns {number} Number of sessions cleaned up
   *
   * @example
   * const count = sessionManager.cleanupExpired(24 * 60 * 60 * 1000);
   */
  cleanupExpired(maxAge = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const expiredSessions = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now - session.lastActivity.getTime();
      if (age > maxAge) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(id => this.deleteSession(id));

    if (expiredSessions.length > 0) {
      logger.info('Cleaned up expired sessions', {
        count: expiredSessions.length,
        maxAge
      });
    }

    return expiredSessions.length;
  }

  /**
   * Start periodic cleanup of expired sessions
   *
   * @param {number} interval - Cleanup interval in milliseconds (default: 1 hour)
   * @private
   */
  startPeriodicCleanup(interval = 60 * 60 * 1000) {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, interval);

    logger.debug('Periodic cleanup started', { interval });
  }

  /**
   * Stop periodic cleanup
   */
  stopPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.debug('Periodic cleanup stopped');
    }
  }

  /**
   * Get session statistics
   *
   * @returns {Object} Statistics
   *
   * @example
   * const stats = sessionManager.getStats();
   * // Returns: { total: 5, active: 3, initializing: 1, ... }
   */
  getStats() {
    const sessions = Array.from(this.sessions.values());

    return {
      total: sessions.length,
      active: sessions.filter(s => s.status === 'active').length,
      initializing: sessions.filter(s => s.status === 'initializing').length,
      with_pty: sessions.filter(s => !!s.ptyProcess).length,
      total_messages: sessions.reduce((sum, s) => sum + s.messages.length, 0)
    };
  }

  /**
   * Clean up all sessions
   * Called on shutdown
   *
   * @returns {number} Number of sessions cleaned up
   */
  cleanupAll() {
    const count = this.sessions.size;
    this.sessions.forEach((session, sessionId) => {
      this.deleteSession(sessionId);
    });

    logger.info('All sessions cleaned up', { count });
    this.stopPeriodicCleanup();

    return count;
  }
}
