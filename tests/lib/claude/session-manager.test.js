/**
 * Session Manager Tests
 */

import { SessionManager } from '../../../lib/claude/session-manager.js';

// Helper to create mock functions
const mockFn = () => {
  const fn = (...args) => {
    fn.mock.calls.push(args);
    return fn._mockReturnValue || undefined;
  };
  fn.mock = { calls: [] };
  fn.mockReturnValue = (value) => {
    fn._mockReturnValue = value;
    return fn;
  };
  return fn;
};

describe('SessionManager', () => {
  let sessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  afterEach(() => {
    sessionManager.cleanupAll();
  });

  describe('createSession', () => {
    test('should create a new session with default options', () => {
      const session = sessionManager.createSession();

      expect(session).toBeDefined();
      expect(session.sessionId).toBeDefined();
      expect(session.status).toBe('initializing');
      expect(session.messages).toEqual([]);
      expect(session.ptyProcess).toBeNull();
      expect(session.options.model).toBe('sonnet');
    });

    test('should create a session with custom options', () => {
      const options = {
        model: 'opus',
        allowedTools: ['Bash', 'Write', 'Read'],
        workingDirectory: '/tmp'
      };

      const session = sessionManager.createSession(options);

      expect(session.options.model).toBe('opus');
      expect(session.options.allowedTools).toEqual(['Bash', 'Write', 'Read']);
      expect(session.options.workingDirectory).toBe('/tmp');
    });

    test('should generate unique session IDs', () => {
      const session1 = sessionManager.createSession();
      const session2 = sessionManager.createSession();

      expect(session1.sessionId).not.toBe(session2.sessionId);
    });

    test('should initialize timestamps', () => {
      const session = sessionManager.createSession();
      const now = new Date();

      expect(session.createdAt).toBeDefined();
      expect(session.lastActivity).toBeDefined();
      expect(session.createdAt.getTime()).toBeLessThanOrEqual(now.getTime());
    });
  });

  describe('getSession', () => {
    test('should return existing session', () => {
      const created = sessionManager.createSession();
      const retrieved = sessionManager.getSession(created.sessionId);

      expect(retrieved).toBe(created);
    });

    test('should return null for non-existent session', () => {
      const result = sessionManager.getSession('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    test('should update session status', () => {
      const session = sessionManager.createSession();
      const result = sessionManager.updateStatus(session.sessionId, 'ready');

      expect(result).toBe(true);
      expect(session.status).toBe('ready');
    });

    test('should update lastActivity timestamp', async () => {
      const session = sessionManager.createSession();
      const oldActivity = session.lastActivity;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      sessionManager.updateStatus(session.sessionId, 'active');
      expect(session.lastActivity.getTime()).toBeGreaterThanOrEqual(oldActivity.getTime());
    });

    test('should return false for non-existent session', () => {
      const result = sessionManager.updateStatus('non-existent', 'ready');
      expect(result).toBe(false);
    });
  });

  describe('setPTYProcess', () => {
    test('should associate PTY process with session', () => {
      const session = sessionManager.createSession();
      const mockPty = { pid: 12345, write: mockFn(), kill: mockFn() };
      const processId = 'proc_test';

      const result = sessionManager.setPTYProcess(session.sessionId, mockPty, processId);

      expect(result).toBe(true);
      expect(session.ptyProcess).toBe(mockPty);
      expect(session.processId).toBe(processId);
    });

    test('should return false for non-existent session', () => {
      const result = sessionManager.setPTYProcess('non-existent', {}, 'proc_test');
      expect(result).toBe(false);
    });
  });

  describe('addMessage', () => {
    test('should add message to session', () => {
      const session = sessionManager.createSession();
      const message = {
        role: 'user',
        content: 'Hello'
      };

      const result = sessionManager.addMessage(session.sessionId, message);

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.role).toBe('user');
      expect(result.content).toBe('Hello');
      expect(result.timestamp).toBeDefined();
      expect(session.messages).toHaveLength(1);
    });

    test('should increment message IDs', () => {
      const session = sessionManager.createSession();

      sessionManager.addMessage(session.sessionId, { role: 'user', content: 'First' });
      sessionManager.addMessage(session.sessionId, { role: 'assistant', content: 'Second' });

      expect(session.messages[0].id).toBe(1);
      expect(session.messages[1].id).toBe(2);
    });

    test('should update lastActivity timestamp', async () => {
      const session = sessionManager.createSession();
      const oldActivity = session.lastActivity;

      await new Promise(resolve => setTimeout(resolve, 10));
      sessionManager.addMessage(session.sessionId, { role: 'user', content: 'Test' });
      expect(session.lastActivity.getTime()).toBeGreaterThanOrEqual(oldActivity.getTime());
    });

    test('should return null for non-existent session', () => {
      const result = sessionManager.addMessage('non-existent', { role: 'user', content: 'Test' });
      expect(result).toBeNull();
    });
  });

  describe('updateScreen', () => {
    test('should update screen content', () => {
      const session = sessionManager.createSession();
      const screen = 'Screen content';

      const result = sessionManager.updateScreen(session.sessionId, screen);

      expect(result).toBe(true);
      expect(session.currentScreen).toBe(screen);
    });

    test('should move currentScreen to lastScreen', () => {
      const session = sessionManager.createSession();

      sessionManager.updateScreen(session.sessionId, 'Screen 1');
      sessionManager.updateScreen(session.sessionId, 'Screen 2');

      expect(session.lastScreen).toBe('Screen 1');
      expect(session.currentScreen).toBe('Screen 2');
    });

    test('should maintain screen history', () => {
      const session = sessionManager.createSession();

      for (let i = 1; i <= 15; i++) {
        sessionManager.updateScreen(session.sessionId, `Screen ${i}`);
      }

      expect(session.screenHistory).toHaveLength(10);
      expect(session.screenHistory[0]).toBe('Screen 6'); // First 5 should be removed
      expect(session.screenHistory[9]).toBe('Screen 15');
    });

    test('should return false for non-existent session', () => {
      const result = sessionManager.updateScreen('non-existent', 'Screen');
      expect(result).toBe(false);
    });
  });

  describe('deleteSession', () => {
    test('should delete session and kill PTY process', () => {
      const session = sessionManager.createSession();
      const mockKill = mockFn();
      const mockPty = { pid: 12345, kill: mockKill };

      sessionManager.setPTYProcess(session.sessionId, mockPty, 'proc_test');
      const result = sessionManager.deleteSession(session.sessionId);

      expect(result).toBe(true);
      expect(mockKill.mock.calls[0]).toEqual(['SIGTERM']);
      expect(sessionManager.getSession(session.sessionId)).toBeNull();
    });

    test('should return false for non-existent session', () => {
      const result = sessionManager.deleteSession('non-existent');
      expect(result).toBe(false);
    });

    test('should handle PTY kill errors gracefully', () => {
      const session = sessionManager.createSession();
      const mockPty = {
        pid: 12345,
        kill: () => {
          throw new Error('Kill failed');
        }
      };

      sessionManager.setPTYProcess(session.sessionId, mockPty, 'proc_test');
      const result = sessionManager.deleteSession(session.sessionId);

      expect(result).toBe(true);
      expect(sessionManager.getSession(session.sessionId)).toBeNull();
    });
  });

  describe('listSessions', () => {
    test('should return empty array when no sessions', () => {
      const sessions = sessionManager.listSessions();
      expect(sessions).toEqual([]);
    });

    test('should list all sessions with summary', () => {
      const session1 = sessionManager.createSession({ model: 'sonnet' });
      const session2 = sessionManager.createSession({ model: 'opus' });

      sessionManager.addMessage(session1.sessionId, { role: 'user', content: 'Test' });
      sessionManager.updateStatus(session2.sessionId, 'ready');

      const sessions = sessionManager.listSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions[0]).toMatchObject({
        session_id: session1.sessionId,
        model: 'sonnet',
        message_count: 1
      });
      expect(sessions[1]).toMatchObject({
        session_id: session2.sessionId,
        model: 'opus',
        status: 'ready'
      });
    });

    test('should include has_pty_process flag', () => {
      const session = sessionManager.createSession();
      const mockPty = { pid: 12345, kill: mockFn() };

      let sessions = sessionManager.listSessions();
      expect(sessions[0].has_pty_process).toBe(false);

      sessionManager.setPTYProcess(session.sessionId, mockPty, 'proc_test');
      sessions = sessionManager.listSessions();
      expect(sessions[0].has_pty_process).toBe(true);
    });
  });

  describe('getSessionDetails', () => {
    test('should return detailed session information', () => {
      const session = sessionManager.createSession({ model: 'opus' });
      sessionManager.addMessage(session.sessionId, { role: 'user', content: 'Test' });
      sessionManager.updateScreen(session.sessionId, 'Screen content');

      const details = sessionManager.getSessionDetails(session.sessionId);

      expect(details).toMatchObject({
        session_id: session.sessionId,
        message_count: 1,
        messages: session.messages,
        options: session.options
      });
      expect(details.options.model).toBe('opus');
      expect(details).toHaveProperty('created_at');
      expect(details).toHaveProperty('last_activity');
      expect(details).toHaveProperty('status');
    });

    test('should return null for non-existent session', () => {
      const details = sessionManager.getSessionDetails('non-existent');
      expect(details).toBeNull();
    });
  });

  describe('cleanupExpired', () => {
    test('should remove sessions older than maxAge', () => {
      const session1 = sessionManager.createSession();
      const session2 = sessionManager.createSession();

      // Manually age session1
      session1.lastActivity = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago

      const count = sessionManager.cleanupExpired(24 * 60 * 60 * 1000); // 24 hours

      expect(count).toBe(1);
      expect(sessionManager.getSession(session1.sessionId)).toBeNull();
      expect(sessionManager.getSession(session2.sessionId)).toBeDefined();
    });

    test('should return 0 when no expired sessions', () => {
      sessionManager.createSession();
      const count = sessionManager.cleanupExpired(24 * 60 * 60 * 1000);

      expect(count).toBe(0);
    });
  });

  describe('getStats', () => {
    test('should return statistics for all sessions', () => {
      const session1 = sessionManager.createSession();
      const session2 = sessionManager.createSession();
      const session3 = sessionManager.createSession();

      sessionManager.updateStatus(session1.sessionId, 'active');
      sessionManager.updateStatus(session2.sessionId, 'active');
      sessionManager.addMessage(session1.sessionId, { role: 'user', content: 'Test 1' });
      sessionManager.addMessage(session1.sessionId, { role: 'assistant', content: 'Test 2' });

      const mockPty = { pid: 12345, kill: mockFn() };
      sessionManager.setPTYProcess(session1.sessionId, mockPty, 'proc_test');

      const stats = sessionManager.getStats();

      expect(stats.total).toBe(3);
      expect(stats.active).toBe(2);
      expect(stats.with_pty).toBe(1);
      expect(stats.total_messages).toBe(2);
    });

    test('should return zero stats when no sessions', () => {
      const stats = sessionManager.getStats();

      expect(stats.total).toBe(0);
      expect(stats.active).toBe(0);
      expect(stats.with_pty).toBe(0);
      expect(stats.total_messages).toBe(0);
    });
  });

  describe('cleanupAll', () => {
    test('should delete all sessions and kill PTY processes', () => {
      const session1 = sessionManager.createSession();
      const session2 = sessionManager.createSession();

      const mockPty1 = { pid: 12345, kill: mockFn() };
      const mockPty2 = { pid: 67890, kill: mockFn() };

      sessionManager.setPTYProcess(session1.sessionId, mockPty1, 'proc_test1');
      sessionManager.setPTYProcess(session2.sessionId, mockPty2, 'proc_test2');

      const count = sessionManager.cleanupAll();

      expect(count).toBe(2);
      expect(mockPty1.kill.mock.calls[0]).toEqual(['SIGTERM']);
      expect(mockPty2.kill.mock.calls[0]).toEqual(['SIGTERM']);
      expect(sessionManager.listSessions()).toHaveLength(0);
    });
  });

  describe('periodic cleanup', () => {
    test('should start periodic cleanup on initialization', () => {
      expect(sessionManager.cleanupInterval).toBeDefined();
    });

    test('should stop periodic cleanup', () => {
      sessionManager.stopPeriodicCleanup();
      expect(sessionManager.cleanupInterval).toBeNull();
    });

    test('should restart periodic cleanup', () => {
      sessionManager.stopPeriodicCleanup();
      sessionManager.startPeriodicCleanup(1000);
      expect(sessionManager.cleanupInterval).toBeDefined();
    });
  });
});
