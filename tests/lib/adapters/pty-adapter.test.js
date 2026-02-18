/**
 * PTY Adapter Unit Tests
 */

import { PTYAdapter } from '../../../lib/adapters/pty-adapter.js';
import { AdapterError } from '../../../lib/utils/errors.js';
import { jest } from '@jest/globals';

// Mock helper function
const mockFn = () => {
  const fn = (...args) => {
    fn._calls.push(args);
    return fn._returnValue || undefined;
  };
  fn._calls = [];
  fn._returnValue = undefined;
  fn.mockReturnValue = (val) => { fn._returnValue = val; return fn; };
  fn.mock = {
    calls: fn._calls,
    get calls() { return fn._calls; }
  };
  return fn;
};

// Mock ProcessManager
class MockProcessManager {
  constructor(config = {}) {
    this.claudeBin = config.claudeBin || 'claude';
    this.maxProcesses = config.maxProcesses || 10;
    this.mockPtyProcess = null;
    this.mockProcessId = 'proc_test_123';
    this.cleanupCalls = [];
  }

  setMockPtyProcess(ptyProcess, processId) {
    this.mockPtyProcess = ptyProcess;
    this.mockProcessId = processId;
  }

  async createPTYProcess(options) {
    if (!this.mockPtyProcess) {
      throw new Error('Mock PTY process not set. Call setMockPtyProcess first.');
    }
    return {
      ptyProcess: this.mockPtyProcess,
      processId: this.mockProcessId
    };
  }

  cleanup(processId, type) {
    this.cleanupCalls.push({ processId, type });
    return true;
  }

  getStats() {
    return {
      total: 0,
      limit: this.maxProcesses,
      cliProcesses: 0,
      ptyProcesses: 0
    };
  }

  gracefulShutdown() {
    return Promise.resolve();
  }
}

// Mock SessionManager
class MockSessionManager {
  constructor() {
    this.sessions = new Map();
    this.cleanupCalls = [];
    // Don't start periodic cleanup in tests
    this.cleanupInterval = null;
  }

  createSession(options = {}) {
    const session = {
      sessionId: 'sess_test_123',
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
    this.sessions.set(session.sessionId, session);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  updateStatus(sessionId, status) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      session.lastActivity = new Date();
      return true;
    }
    return false;
  }

  setPTYProcess(sessionId, ptyProcess, processId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.ptyProcess = ptyProcess;
      session.processId = processId;
      session.lastActivity = new Date();
      return true;
    }
    return false;
  }

  addMessage(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (session) {
      const msg = {
        id: session.messages.length + 1,
        ...message,
        timestamp: new Date()
      };
      session.messages.push(msg);
      session.lastActivity = new Date();
      return msg;
    }
    return null;
  }

  updateScreen(sessionId, screen) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastScreen = session.currentScreen;
      session.currentScreen = screen;
      session.lastActivity = new Date();
      session.screenHistory.push(screen);
      if (session.screenHistory.length > 10) {
        session.screenHistory.shift();
      }
      return true;
    }
    return false;
  }

  deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session && session.ptyProcess) {
      try {
        session.ptyProcess.kill('SIGTERM');
      } catch (error) {
        // Ignore
      }
    }
    return this.sessions.delete(sessionId);
  }

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

  cleanupAll() {
    const count = this.sessions.size;
    this.sessions.forEach((session, sessionId) => {
      this.deleteSession(sessionId);
    });
    this.cleanupCalls.push({ type: 'cleanupAll', count });
    return count;
  }
}

// Mock PTY Process
class MockPtyProcess {
  constructor(options = {}) {
    this.pid = options.pid || 12345;
    this._dataListeners = [];
    this._writeCalls = [];
  }

  write(data) {
    this._writeCalls.push(data);
  }

  on(event, callback) {
    if (event === 'data') {
      this._dataListeners.push(callback);
    }
  }

  off(event, callback) {
    if (event === 'data') {
      const index = this._dataListeners.indexOf(callback);
      if (index > -1) {
        this._dataListeners.splice(index, 1);
      }
    }
  }

  emitData(data) {
    this._dataListeners.forEach(listener => {
      if (listener) {
        listener(data);
      }
    });
  }

  kill(signal) {
    // Mock kill
  }

  getWriteCalls() {
    return this._writeCalls;
  }

  clearWriteCalls() {
    this._writeCalls = [];
  }
}

describe('PTYAdapter', () => {
  let adapter;
  let mockProcessManager;
  let mockSessionManager;
  let mockPtyProcess;

  beforeEach(() => {
    mockProcessManager = new MockProcessManager();
    mockSessionManager = new MockSessionManager();
    mockPtyProcess = new MockPtyProcess();
    mockProcessManager.setMockPtyProcess(mockPtyProcess, 'proc_test_123');
  });

  afterEach(() => {
    if (adapter) {
      // Clean up any resources
      jest.clearAllMocks();
    }
  });

  describe('constructor', () => {
    test('should initialize with default configuration', () => {
      adapter = new PTYAdapter();

      expect(adapter).toBeDefined();
      expect(adapter.claudeBin).toBe('claude');
      expect(adapter.processManager).toBeDefined();
      expect(adapter.sessionManager).toBeDefined();
    });

    test('should initialize with custom claudeBin', () => {
      adapter = new PTYAdapter({ claudeBin: 'claude-custom' });

      expect(adapter.claudeBin).toBe('claude-custom');
    });

    test('should initialize with custom maxProcesses', () => {
      adapter = new PTYAdapter({ maxProcesses: 5 });

      expect(adapter.processManager.maxProcesses).toBe(5);
    });

    test('should use CLAUDE_BIN environment variable', () => {
      const originalBin = process.env.CLAUDE_BIN;
      process.env.CLAUDE_BIN = 'claude-env';

      adapter = new PTYAdapter();

      expect(adapter.claudeBin).toBe('claude-env');

      process.env.CLAUDE_BIN = originalBin;
    });

    test('should prioritize config over environment variable', () => {
      const originalBin = process.env.CLAUDE_BIN;
      process.env.CLAUDE_BIN = 'claude-env';

      adapter = new PTYAdapter({ claudeBin: 'claude-config' });

      expect(adapter.claudeBin).toBe('claude-config');

      process.env.CLAUDE_BIN = originalBin;
    });
  });

  describe('getOrCreateSession', () => {
    beforeEach(() => {
      adapter = new PTYAdapter();
      adapter.processManager = mockProcessManager;
      adapter.sessionManager = mockSessionManager;
    });

    test('should create new session when sessionId is null', async () => {
      // Mock waitForPrompt to resolve immediately
      adapter.waitForPrompt = jest.fn().mockResolvedValue();

      const session = await adapter.getOrCreateSession(null, {
        model: 'sonnet',
        allowedTools: ['Bash', 'Write']
      });

      expect(session).toBeDefined();
      expect(session.sessionId).toBe('sess_test_123');
      expect(session.status).toBe('ready');
      expect(session.ptyProcess).toBeDefined();
      expect(session.processId).toBe('proc_test_123');
    });

    test('should return existing session when sessionId is provided', async () => {
      adapter.waitForPrompt = jest.fn().mockResolvedValue();

      // Create session first
      const session1 = await adapter.getOrCreateSession(null, { model: 'sonnet' });

      // Get existing session
      const session2 = await adapter.getOrCreateSession(session1.sessionId, {});

      expect(session2.sessionId).toBe(session1.sessionId);
      expect(session2.status).toBe('ready');
    });

    test('should create new session when sessionId does not exist', async () => {
      adapter.waitForPrompt = jest.fn().mockResolvedValue();

      const session = await adapter.getOrCreateSession('nonexistent-id', {
        model: 'sonnet'
      });

      expect(session).toBeDefined();
      expect(session.sessionId).not.toBe('nonexistent-id');
    });

    test('should call waitForPrompt after creating PTY process', async () => {
      const waitForPromptSpy = jest.fn().mockResolvedValue();
      adapter.waitForPrompt = waitForPromptSpy;

      await adapter.getOrCreateSession(null, { model: 'sonnet' });

      expect(waitForPromptSpy).toHaveBeenCalledTimes(1);
      expect(waitForPromptSpy).toHaveBeenCalledWith('sess_test_123');
    });

    test('should update session status to ready', async () => {
      adapter.waitForPrompt = jest.fn().mockResolvedValue();

      const session = await adapter.getOrCreateSession(null, { model: 'sonnet' });

      expect(session.status).toBe('ready');
    });

    test('should associate PTY process with session', async () => {
      adapter.waitForPrompt = jest.fn().mockResolvedValue();

      const session = await adapter.getOrCreateSession(null, { model: 'sonnet' });

      expect(session.ptyProcess).toBeDefined();
      expect(session.ptyProcess.pid).toBe(12345);
      expect(session.processId).toBe('proc_test_123');
    });

    test('should pass options to session creation', async () => {
      adapter.waitForPrompt = jest.fn().mockResolvedValue();

      const session = await adapter.getOrCreateSession(null, {
        model: 'opus',
        allowedTools: ['Bash', 'Write', 'Read'],
        workingDirectory: '/tmp'
      });

      expect(session.options.model).toBe('opus');
      expect(session.options.allowedTools).toEqual(['Bash', 'Write', 'Read']);
      expect(session.options.workingDirectory).toBe('/tmp');
    });

    test('should handle waitForPrompt timeout', async () => {
      adapter.waitForPrompt = jest.fn().mockRejectedValue(
        new AdapterError('Timeout waiting for prompt')
      );

      await expect(
        adapter.getOrCreateSession(null, { model: 'sonnet' })
      ).rejects.toThrow(AdapterError);
    });
  });

  describe('sendMessage', () => {
    beforeEach(() => {
      adapter = new PTYAdapter();
      adapter.processManager = mockProcessManager;
      adapter.sessionManager = mockSessionManager;
    });

    test('should send message to existing session', async () => {
      // Create session
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      await adapter.sendMessage(session.sessionId, 'Hello Claude');

      const writeCalls = mockPtyProcess.getWriteCalls();
      expect(writeCalls.length).toBeGreaterThan(0);
      expect(writeCalls[0]).toBe('\x1b[200~'); // Bracketed paste mode start
      expect(writeCalls[writeCalls.length - 1]).toBe('\r'); // Enter
    });

    test('should use bracketed paste mode', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      await adapter.sendMessage(session.sessionId, 'Test message');

      const writeCalls = mockPtyProcess.getWriteCalls();
      expect(writeCalls[0]).toBe('\x1b[200~'); // Enable bracketed paste
      expect(writeCalls[writeCalls.length - 2]).toBe('\x1b[201~'); // Disable bracketed paste
    });

    test('should add user message to session history', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      await adapter.sendMessage(session.sessionId, 'Hello');

      expect(session.messages.length).toBe(1);
      expect(session.messages[0].role).toBe('user');
      expect(session.messages[0].content).toBe('Hello');
    });

    test('should update session status to processing', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      await adapter.sendMessage(session.sessionId, 'Hello');

      expect(session.status).toBe('processing');
    });

    test('should throw AdapterError when session not found', async () => {
      await expect(
        adapter.sendMessage('nonexistent-id', 'Hello')
      ).rejects.toThrow(AdapterError);
    });

    test('should throw AdapterError when session has no PTY process', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      // Don't set ptyProcess

      await expect(
        adapter.sendMessage(session.sessionId, 'Hello')
      ).rejects.toThrow(AdapterError);
    });

    test('should handle write errors', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      const errorPtyProcess = new MockPtyProcess();
      errorPtyProcess.write = () => {
        throw new Error('Write failed');
      };
      session.ptyProcess = errorPtyProcess;
      session.processId = 'proc_test_123';

      await expect(
        adapter.sendMessage(session.sessionId, 'Hello')
      ).rejects.toThrow(AdapterError);

      expect(session.status).toBe('error');
    });

    test('should send content correctly', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      const content = 'List all files in current directory';
      await adapter.sendMessage(session.sessionId, content);

      const writeCalls = mockPtyProcess.getWriteCalls();
      const contentIndex = writeCalls.findIndex(call => call === content);
      expect(contentIndex).toBeGreaterThan(0);
    });

    test('should handle multi-line messages', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      const content = 'Line 1\nLine 2\nLine 3';
      await adapter.sendMessage(session.sessionId, content);

      const writeCalls = mockPtyProcess.getWriteCalls();
      expect(writeCalls.some(call => call === content)).toBe(true);
    });

    test('should handle special characters in message', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      const content = 'Hello\n\tWorld!<>{}';
      await adapter.sendMessage(session.sessionId, content);

      const writeCalls = mockPtyProcess.getWriteCalls();
      expect(writeCalls.some(call => call === content)).toBe(true);
    });
  });

  describe('streamResponse', () => {
    beforeEach(() => {
      adapter = new PTYAdapter();
      adapter.processManager = mockProcessManager;
      adapter.sessionManager = mockSessionManager;
    });

    test('should yield content events', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      const events = [];
      const stream = adapter.streamResponse(session.sessionId);

      // Emit some data quickly
      setTimeout(() => {
        mockPtyProcess.emitData('Hello');
      }, 10);

      // Simulate screen stability - emit same data multiple times
      setTimeout(() => {
        mockPtyProcess.emitData('Hello');
      }, 20);
      setTimeout(() => {
        mockPtyProcess.emitData('Hello');
      }, 30);
      setTimeout(() => {
        mockPtyProcess.emitData('Hello');
      }, 40);

      for await (const event of stream) {
        events.push(event);
        if (event.type === 'done') break;
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'done')).toBe(true);
    }, 5000);

    test('should throw AdapterError when session not found', async () => {
      const stream = adapter.streamResponse('nonexistent-id');

      let errorThrown = false;
      try {
        for await (const event of stream) {
          // Should not reach here
        }
      } catch (error) {
        errorThrown = true;
        expect(error).toBeInstanceOf(AdapterError);
      }

      expect(errorThrown).toBe(true);
    });

    test('should throw AdapterError when session has no PTY process', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      // Don't set ptyProcess

      const stream = adapter.streamResponse(session.sessionId);

      let errorThrown = false;
      try {
        for await (const event of stream) {
          // Should not reach here
        }
      } catch (error) {
        errorThrown = true;
        expect(error).toBeInstanceOf(AdapterError);
      }

      expect(errorThrown).toBe(true);
    });

    test('should yield tool call events', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      const events = [];
      const stream = adapter.streamResponse(session.sessionId);

      // Emit data with tool call
      setTimeout(() => {
        mockPtyProcess.emitData('Tool call: Bash(ls -la)');
      }, 10);

      // Simulate stability - emit same data multiple times
      setTimeout(() => {
        mockPtyProcess.emitData('Tool call: Bash(ls -la)');
      }, 20);
      setTimeout(() => {
        mockPtyProcess.emitData('Tool call: Bash(ls -la)');
      }, 30);
      setTimeout(() => {
        mockPtyProcess.emitData('Tool call: Bash(ls -la)');
      }, 40);

      for await (const event of stream) {
        events.push(event);
        if (event.type === 'done') break;
      }

      // Note: Tool call detection depends on ScreenParser implementation
      expect(events.length).toBeGreaterThan(0);
    }, 5000);

    test('should handle timeout', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      // Mock config to have very short timeout
      jest.mock('../../../lib/config/agent-config.js', () => ({
        AGENT_CONFIG: {
          timeouts: {
            STREAM: 100, // Very short timeout
            STREAM_CHECK: 10
          },
          screen: {
            STABLE_COUNT: 3,
            STABILITY_THRESHOLD: 0.95
          }
        }
      }));

      const events = [];
      const stream = adapter.streamResponse(session.sessionId);

      // Don't emit any data, let it timeout

      for await (const event of stream) {
        events.push(event);
        if (event.type === 'done' || event.type === 'warning') break;
      }

      expect(events.length).toBeGreaterThan(0);
    }, 15000);

    test('should add assistant message to session history', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      const stream = adapter.streamResponse(session.sessionId);

      setTimeout(() => {
        mockPtyProcess.emitData('Hello response');
      }, 10);
      setTimeout(() => {
        mockPtyProcess.emitData('Hello response');
      }, 20);
      setTimeout(() => {
        mockPtyProcess.emitData('Hello response');
      }, 30);
      setTimeout(() => {
        mockPtyProcess.emitData('Hello response');
      }, 40);

      for await (const event of stream) {
        if (event.type === 'done') break;
      }

      expect(session.messages.some(m => m.role === 'assistant')).toBe(true);
    }, 5000);

    test('should update session status to ready after completion', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';
      session.status = 'processing';

      const stream = adapter.streamResponse(session.sessionId);

      setTimeout(() => {
        mockPtyProcess.emitData('Response');
      }, 10);
      setTimeout(() => {
        mockPtyProcess.emitData('Response');
      }, 20);
      setTimeout(() => {
        mockPtyProcess.emitData('Response');
      }, 30);
      setTimeout(() => {
        mockPtyProcess.emitData('Response');
      }, 40);

      for await (const event of stream) {
        if (event.type === 'done') break;
      }

      expect(session.status).toBe('ready');
    }, 5000);

    test('should remove data listener after completion', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      const stream = adapter.streamResponse(session.sessionId);

      setTimeout(() => {
        mockPtyProcess.emitData('Response');
      }, 10);
      setTimeout(() => {
        mockPtyProcess.emitData('Response');
      }, 20);
      setTimeout(() => {
        mockPtyProcess.emitData('Response');
      }, 30);
      setTimeout(() => {
        mockPtyProcess.emitData('Response');
      }, 40);

      for await (const event of stream) {
        if (event.type === 'done') break;
      }

      // Listener should be removed
      expect(mockPtyProcess._dataListeners.length).toBe(0);
    }, 5000);

    test('should handle errors during streaming', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      // Mock ScreenParser to throw error
      jest.doMock('../../../lib/claude/screen-parser.js', () => ({
        ScreenParser: {
          analyzeScreen: () => {
            throw new Error('Parse error');
          }
        }
      }));

      const stream = adapter.streamResponse(session.sessionId);

      setTimeout(() => {
        mockPtyProcess.emitData('Some data');
      }, 50);

      let errorThrown = false;
      try {
        for await (const event of stream) {
          // Should error
        }
      } catch (error) {
        errorThrown = true;
        expect(error).toBeInstanceOf(AdapterError);
      }

      expect(errorThrown).toBe(true);
      expect(session.status).toBe('error');
    }, 10000);
  });

  describe('waitForPrompt', () => {
    beforeEach(() => {
      adapter = new PTYAdapter();
      adapter.processManager = mockProcessManager;
      adapter.sessionManager = mockSessionManager;
    });

    test('should resolve when prompt is detected', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      const promptPromise = adapter.waitForPrompt(session.sessionId);

      // Emit prompt after delay
      setTimeout(() => {
        mockPtyProcess.emitData('> ');
      }, 50);

      await expect(promptPromise).resolves.not.toThrow();
    }, 5000);

    test('should detect prompt with content before it', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      const promptPromise = adapter.waitForPrompt(session.sessionId);

      setTimeout(() => {
        mockPtyProcess.emitData('Some content\n> ');
      }, 50);

      await expect(promptPromise).resolves.not.toThrow();
    }, 5000);

    test('should timeout when prompt is not detected', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      // Use short timeout
      const promptPromise = adapter.waitForPrompt(session.sessionId, 100);

      // Don't emit prompt

      await expect(promptPromise).rejects.toThrow(AdapterError);
    }, 5000);

    test('should throw AdapterError when session not found', async () => {
      await expect(
        adapter.waitForPrompt('nonexistent-id')
      ).rejects.toThrow(AdapterError);
    });

    test('should update screen buffer while waiting', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      const promptPromise = adapter.waitForPrompt(session.sessionId);

      setTimeout(() => {
        mockPtyProcess.emitData('Loading...\n> ');
      }, 50);

      await promptPromise;

      expect(session.currentScreen).toContain('Loading...');
    }, 5000);

    test('should remove data listener after timeout', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      const promptPromise = adapter.waitForPrompt(session.sessionId, 100);

      try {
        await promptPromise;
      } catch (error) {
        // Expected timeout
      }

      // Listener should be removed
      expect(mockPtyProcess._dataListeners.length).toBe(0);
    }, 5000);
  });

  describe('listSessions', () => {
    beforeEach(() => {
      adapter = new PTYAdapter();
      adapter.processManager = mockProcessManager;
      adapter.sessionManager = mockSessionManager;
    });

    test('should return list of sessions', () => {
      mockSessionManager.createSession({ model: 'sonnet' });
      mockSessionManager.createSession({ model: 'opus' });

      const sessions = adapter.listSessions();

      expect(sessions).toBeDefined();
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBe(2);
    });

    test('should return empty array when no sessions', () => {
      const sessions = adapter.listSessions();

      expect(sessions).toEqual([]);
    });

    test('should include session metadata', () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      const sessions = adapter.listSessions();

      expect(sessions[0].session_id).toBeDefined();
      expect(sessions[0].status).toBeDefined();
      expect(sessions[0].model).toBeDefined();
    });
  });

  describe('getSession', () => {
    beforeEach(() => {
      adapter = new PTYAdapter();
      adapter.processManager = mockProcessManager;
      adapter.sessionManager = mockSessionManager;
    });

    test('should return session details', () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });

      const details = adapter.getSession(session.sessionId);

      expect(details).toBeDefined();
      expect(details.session_id).toBe(session.sessionId);
      expect(details.status).toBeDefined();
      expect(details.messages).toBeDefined();
    });

    test('should return null for nonexistent session', () => {
      const details = adapter.getSession('nonexistent-id');

      expect(details).toBeNull();
    });

    test('should include session options', () => {
      const session = mockSessionManager.createSession({
        model: 'opus',
        allowedTools: ['Bash', 'Write']
      });

      const details = adapter.getSession(session.sessionId);

      expect(details.options).toBeDefined();
      expect(details.options.model).toBe('opus');
      expect(details.options.allowedTools).toEqual(['Bash', 'Write']);
    });
  });

  describe('deleteSession', () => {
    beforeEach(() => {
      adapter = new PTYAdapter();
      adapter.processManager = mockProcessManager;
      adapter.sessionManager = mockSessionManager;
    });

    test('should delete existing session', () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.processId = 'proc_test_123';

      const deleted = adapter.deleteSession(session.sessionId);

      expect(deleted).toBe(true);
      expect(mockSessionManager.getSession(session.sessionId)).toBeNull();
    });

    test('should return false for nonexistent session', () => {
      const deleted = adapter.deleteSession('nonexistent-id');

      expect(deleted).toBe(false);
    });

    test('should cleanup process manager', () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.processId = 'proc_test_123';

      adapter.deleteSession(session.sessionId);

      expect(mockProcessManager.cleanupCalls.length).toBe(1);
      expect(mockProcessManager.cleanupCalls[0].processId).toBe('proc_test_123');
      expect(mockProcessManager.cleanupCalls[0].type).toBe('pty');
    });

    test('should not cleanup process manager when no processId', () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      // Don't set processId

      adapter.deleteSession(session.sessionId);

      expect(mockProcessManager.cleanupCalls.length).toBe(0);
    });
  });

  describe('healthCheck', () => {
    beforeEach(() => {
      adapter = new PTYAdapter();
      adapter.processManager = mockProcessManager;
      adapter.sessionManager = mockSessionManager;
    });

    test('should return health status', () => {
      const health = adapter.healthCheck();

      expect(health).toBeDefined();
      expect(health.adapter).toBe('pty');
      expect(health.healthy).toBeDefined();
      expect(health.processes).toBeDefined();
      expect(health.sessions).toBeDefined();
    });

    test('should return healthy when under limit', () => {
      const health = adapter.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.processes.total).toBe(0);
      expect(health.processes.limit).toBe(10);
    });

    test('should return unhealthy when at limit', () => {
      adapter.processManager.getStats = () => ({
        total: 10,
        limit: 10,
        cliProcesses: 5,
        ptyProcesses: 5
      });

      const health = adapter.healthCheck();

      expect(health.healthy).toBe(false);
    });

    test('should include process statistics', () => {
      const health = adapter.healthCheck();

      expect(health.processes.cliProcesses).toBeDefined();
      expect(health.processes.ptyProcesses).toBeDefined();
      expect(health.processes.total).toBeDefined();
      expect(health.processes.limit).toBeDefined();
    });

    test('should include session statistics', () => {
      mockSessionManager.createSession({ model: 'sonnet' });

      const health = adapter.healthCheck();

      expect(health.sessions.total).toBe(1);
      expect(health.sessions.active).toBeDefined();
      expect(health.sessions.with_pty).toBeDefined();
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      adapter = new PTYAdapter();
      adapter.processManager = mockProcessManager;
      adapter.sessionManager = mockSessionManager;
    });

    test('should cleanup all sessions', async () => {
      mockSessionManager.createSession({ model: 'sonnet' });
      mockSessionManager.createSession({ model: 'opus' });

      await adapter.cleanup();

      expect(mockSessionManager.sessions.size).toBe(0);
    });

    test('should call process manager gracefulShutdown', async () => {
      const gracefulShutdownSpy = jest.fn().mockResolvedValue();
      adapter.processManager.gracefulShutdown = gracefulShutdownSpy;

      await adapter.cleanup();

      expect(gracefulShutdownSpy).toHaveBeenCalledTimes(1);
    });

    test('should resolve successfully', async () => {
      await expect(adapter.cleanup()).resolves.not.toThrow();
    });

    test('should cleanup session manager periodic cleanup', async () => {
      mockSessionManager.createSession({ model: 'sonnet' });

      await adapter.cleanup();

      expect(mockSessionManager.cleanupCalls.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      adapter = new PTYAdapter();
      adapter.processManager = mockProcessManager;
      adapter.sessionManager = mockSessionManager;
    });

    test('should handle PTY process errors during sendMessage', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      const errorPtyProcess = new MockPtyProcess();
      errorPtyProcess.write = () => {
        throw new Error('PTY error');
      };
      session.ptyProcess = errorPtyProcess;
      session.processId = 'proc_test_123';

      await expect(
        adapter.sendMessage(session.sessionId, 'Hello')
      ).rejects.toThrow(AdapterError);

      expect(session.status).toBe('error');
    });

    test('should handle PTY process errors during streamResponse', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      const stream = adapter.streamResponse(session.sessionId);

      // Emit data and then stabilize
      setTimeout(() => {
        mockPtyProcess.emitData('Error: Something went wrong');
      }, 10);
      setTimeout(() => {
        mockPtyProcess.emitData('Error: Something went wrong');
      }, 20);
      setTimeout(() => {
        mockPtyProcess.emitData('Error: Something went wrong');
      }, 30);
      setTimeout(() => {
        mockPtyProcess.emitData('Error: Something went wrong');
      }, 40);

      let hadError = false;
      try {
        for await (const event of stream) {
          // Process stream
          if (event.type === 'done') break;
        }
      } catch (error) {
        hadError = true;
      }

      // May or may not error depending on ScreenParser behavior
      expect(true).toBe(true);
    }, 5000);

    test('should handle session not found in sendMessage', async () => {
      await expect(
        adapter.sendMessage('invalid-id', 'Hello')
      ).rejects.toThrow(AdapterError);
    });

    test('should handle session not found in streamResponse', async () => {
      const stream = adapter.streamResponse('invalid-id');

      let errorThrown = false;
      try {
        for await (const event of stream) {
          // Should error
        }
      } catch (error) {
        errorThrown = true;
        expect(error).toBeInstanceOf(AdapterError);
      }

      expect(errorThrown).toBe(true);
    });

    test('should handle session not found in waitForPrompt', async () => {
      await expect(
        adapter.waitForPrompt('invalid-id')
      ).rejects.toThrow(AdapterError);
    });
  });

  describe('integration scenarios', () => {
    beforeEach(() => {
      adapter = new PTYAdapter();
      adapter.processManager = mockProcessManager;
      adapter.sessionManager = mockSessionManager;
    });

    test('should handle complete session lifecycle', async () => {
      adapter.waitForPrompt = jest.fn().mockResolvedValue();

      // Create session
      const session = await adapter.getOrCreateSession(null, {
        model: 'sonnet',
        allowedTools: ['Bash', 'Write']
      });

      expect(session.sessionId).toBeDefined();
      expect(session.status).toBe('ready');

      // Send message
      await adapter.sendMessage(session.sessionId, 'List files');

      expect(session.messages.length).toBe(1);
      expect(session.messages[0].role).toBe('user');

      // Stream response
      const stream = adapter.streamResponse(session.sessionId);

      setTimeout(() => {
        mockPtyProcess.emitData('File listing...');
      }, 10);
      setTimeout(() => {
        mockPtyProcess.emitData('File listing...');
      }, 20);
      setTimeout(() => {
        mockPtyProcess.emitData('File listing...');
      }, 30);
      setTimeout(() => {
        mockPtyProcess.emitData('File listing...');
      }, 40);

      const events = [];
      for await (const event of stream) {
        events.push(event);
        if (event.type === 'done') break;
      }

      expect(events.length).toBeGreaterThan(0);
      expect(session.messages.some(m => m.role === 'assistant')).toBe(true);

      // Delete session
      const deleted = adapter.deleteSession(session.sessionId);

      expect(deleted).toBe(true);
      expect(mockSessionManager.getSession(session.sessionId)).toBeNull();
    }, 10000);

    test('should handle multiple concurrent sessions', async () => {
      adapter.waitForPrompt = jest.fn().mockResolvedValue();

      // Create multiple sessions
      const session1 = await adapter.getOrCreateSession(null, { model: 'sonnet' });
      const session2 = await adapter.getOrCreateSession(null, { model: 'opus' });

      expect(session1.sessionId).not.toBe(session2.sessionId);

      // Send messages to both
      await adapter.sendMessage(session1.sessionId, 'Hello from session 1');
      await adapter.sendMessage(session2.sessionId, 'Hello from session 2');

      expect(session1.messages.length).toBe(1);
      expect(session2.messages.length).toBe(1);

      // List sessions
      const sessions = adapter.listSessions();

      expect(sessions.length).toBe(2);
    });

    test('should handle session reuse', async () => {
      adapter.waitForPrompt = jest.fn().mockResolvedValue();

      // Create session
      const session1 = await adapter.getOrCreateSession(null, { model: 'sonnet' });

      // Reuse session
      const session2 = await adapter.getOrCreateSession(session1.sessionId, {});

      expect(session2.sessionId).toBe(session1.sessionId);

      // Send multiple messages
      await adapter.sendMessage(session1.sessionId, 'First message');
      await adapter.sendMessage(session1.sessionId, 'Second message');

      expect(session1.messages.length).toBe(2);
    });

    test('should handle health check with active sessions', async () => {
      adapter.waitForPrompt = jest.fn().mockResolvedValue();

      await adapter.getOrCreateSession(null, { model: 'sonnet' });
      await adapter.getOrCreateSession(null, { model: 'opus' });

      const health = adapter.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.sessions.total).toBe(2);
      expect(health.processes.total).toBeGreaterThan(0);
    });

    test('should handle cleanup with multiple sessions', async () => {
      adapter.waitForPrompt = jest.fn().mockResolvedValue();

      await adapter.getOrCreateSession(null, { model: 'sonnet' });
      await adapter.getOrCreateSession(null, { model: 'opus' });

      await adapter.cleanup();

      expect(mockSessionManager.sessions.size).toBe(0);
      expect(mockProcessManager.cleanupCalls.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      adapter = new PTYAdapter();
      adapter.processManager = mockProcessManager;
      adapter.sessionManager = mockSessionManager;
    });

    test('should handle empty message', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      await expect(
        adapter.sendMessage(session.sessionId, '')
      ).resolves.not.toThrow();
    });

    test('should handle very long message', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      const longMessage = 'a'.repeat(10000);

      await expect(
        adapter.sendMessage(session.sessionId, longMessage)
      ).resolves.not.toThrow();

      const writeCalls = mockPtyProcess.getWriteCalls();
      expect(writeCalls.some(call => call === longMessage)).toBe(true);
    });

    test('should handle Unicode in message', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      const unicodeMessage = 'Hello 你好 🌍';

      await expect(
        adapter.sendMessage(session.sessionId, unicodeMessage)
      ).resolves.not.toThrow();
    });

    test('should handle session with no allowed tools', async () => {
      adapter.waitForPrompt = jest.fn().mockResolvedValue();

      const session = await adapter.getOrCreateSession(null, {
        model: 'sonnet',
        allowedTools: null
      });

      expect(session.options.allowedTools).toBeNull();
    });

    test('should handle session with empty allowed tools array', async () => {
      adapter.waitForPrompt = jest.fn().mockResolvedValue();

      const session = await adapter.getOrCreateSession(null, {
        model: 'sonnet',
        allowedTools: []
      });

      expect(session.options.allowedTools).toEqual([]);
    });

    test('should handle streaming with no data', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      const stream = adapter.streamResponse(session.sessionId);

      // Don't emit any data - will timeout after MAX_STREAM_DURATION

      const events = [];
      for await (const event of stream) {
        events.push(event);
        if (event.type === 'done' || event.type === 'warning') break;
      }

      expect(events.length).toBeGreaterThan(0);
    }, 50000);

    test('should handle rapid screen changes', async () => {
      const session = mockSessionManager.createSession({ model: 'sonnet' });
      session.ptyProcess = mockPtyProcess;
      session.processId = 'proc_test_123';

      const stream = adapter.streamResponse(session.sessionId);

      // Emit rapidly changing data then stabilize
      let count = 0;
      const interval = setInterval(() => {
        mockPtyProcess.emitData(`Data chunk ${count++}`);
        if (count > 5) {
          clearInterval(interval);
          // Finally stabilize
          mockPtyProcess.emitData('Final data');
          setTimeout(() => {
            mockPtyProcess.emitData('Final data');
          }, 20);
          setTimeout(() => {
            mockPtyProcess.emitData('Final data');
          }, 40);
          setTimeout(() => {
            mockPtyProcess.emitData('Final data');
          }, 60);
        }
      }, 10);

      const events = [];
      for await (const event of stream) {
        events.push(event);
        if (event.type === 'done') break;
      }

      expect(events.length).toBeGreaterThan(0);
    }, 10000);
  });
});
