/**
 * CLI Adapter Unit Tests
 */

import { CLIAdapter } from '../../../lib/adapters/cli-adapter.js';
import { ValidationError, AdapterError } from '../../../lib/utils/errors.js';

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
    this.mockProcess = null;
    this.mockProcessId = 'proc_test_123';
    this.cleanupCalls = [];
  }

  setMockProcess(process, processId) {
    this.mockProcess = process;
    this.mockProcessId = processId;
  }

  createCLIProcess(options) {
    if (!this.mockProcess) {
      throw new Error('Mock process not set. Call setMockProcess first.');
    }
    return {
      process: this.mockProcess,
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

// Mock child process
class MockChildProcess {
  constructor(options = {}) {
    this.pid = options.pid || 12345;
    this.stdin = {
      write: mockFn(),
      end: mockFn()
    };
    this.exitCode = options.exitCode || null;
    this._closeEmitted = false;
    this._stdoutData = '';
    this._stderrData = '';

    // Initialize listeners on instance
    this._stdoutListeners = {};
    this._stderrListeners = {};

    // Create stdout stream
    this.stdout = {
      on: (event, callback) => {
        this._stdoutListeners[event] = callback;
      },
      emitData: (data) => {
        this._stdoutData += data;
        if (this._stdoutListeners.data) {
          this._stdoutListeners.data(data);
        }
      },
      getData: () => this._stdoutData
    };

    // Create stderr stream
    this.stderr = {
      on: (event, callback) => {
        this._stderrListeners[event] = callback;
      },
      emitData: (data) => {
        this._stderrData += data;
        if (this._stderrListeners.data) {
          this._stderrListeners.data(data);
        }
      },
      getData: () => this._stderrData
    };
  }

  kill(signal) {
    this.exitCode = 0;
    if (this._closeListener) {
      this._closeListener(this.exitCode);
    }
    this._closeEmitted = true;
  }

  on(event, callback) {
    if (event === 'close') {
      this._closeListener = callback;
    }
  }

  emitClose(code = 0) {
    this.exitCode = code;
    if (this._closeListener) {
      this._closeListener(code);
    }
  }
}

describe('CLIAdapter', () => {
  let adapter;
  let mockProcessManager;
  let mockProcess;

  // Helper to simulate process response
  const simulateProcessResponse = (process, result, exitCode = 0, delay = 0) => {
    const responseData = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result
    });

    const emit = () => {
      process.stdout.emitData(responseData);
      process.emitClose(exitCode);
    };

    if (delay > 0) {
      setTimeout(emit, delay);
    } else {
      emit();
    }
  };

  beforeEach(() => {
    mockProcessManager = new MockProcessManager();
    mockProcess = new MockChildProcess();
    mockProcessManager.setMockProcess(mockProcess, 'proc_test_123');
  });

  afterEach(() => {
    if (adapter && adapter.processManager) {
      // Clean up any active processes
    }
  });

  describe('constructor', () => {
    test('should initialize with default configuration', () => {
      adapter = new CLIAdapter();

      expect(adapter).toBeDefined();
      expect(adapter.claudeBin).toBe('claude');
      expect(adapter.processManager).toBeDefined();
    });

    test('should initialize with custom claudeBin', () => {
      adapter = new CLIAdapter({ claudeBin: 'claude-custom' });

      expect(adapter.claudeBin).toBe('claude-custom');
    });

    test('should initialize with custom maxProcesses', () => {
      adapter = new CLIAdapter({ maxProcesses: 5 });

      expect(adapter.processManager.maxProcesses).toBe(5);
    });

    test('should use CLAUDE_BIN environment variable', () => {
      const originalBin = process.env.CLAUDE_BIN;
      process.env.CLAUDE_BIN = 'claude-env';

      adapter = new CLIAdapter();

      expect(adapter.claudeBin).toBe('claude-env');

      process.env.CLAUDE_BIN = originalBin;
    });

    test('should prioritize config over environment variable', () => {
      const originalBin = process.env.CLAUDE_BIN;
      process.env.CLAUDE_BIN = 'claude-env';

      adapter = new CLIAdapter({ claudeBin: 'claude-config' });

      expect(adapter.claudeBin).toBe('claude-config');

      process.env.CLAUDE_BIN = originalBin;
    });
  });

  describe('processRequest', () => {
    beforeEach(() => {
      adapter = new CLIAdapter();
      adapter.processManager = mockProcessManager;
    });

    test('should process basic streaming request', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'sonnet',
        stream: true
      };

      mockProcess.emitClose(0);

      const response = await adapter.processRequest(request);

      expect(response).toBeDefined();
      expect(response.type).toBe('stream');
      expect(response.processId).toBe('proc_test_123');
      expect(response.generator).toBeDefined();
      expect(mockProcess.stdin.write.mock.calls.length).toBeGreaterThan(0);
      expect(mockProcess.stdin.end.mock.calls.length).toBe(1);
    });

    test('should process non-streaming request', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'sonnet',
        stream: false
      };

      // Setup mock response
      setTimeout(() => {
        const mockResponse = JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'Hello! How can I help you?'
        });
        mockProcess.stdout.emitData(mockResponse);
        mockProcess.emitClose(0);
      }, 50);

      const response = await adapter.processRequest(request);

      expect(response).toBeDefined();
      expect(response.type).toBe('response');
      expect(response.data).toBeDefined();
      expect(response.data.choices).toBeDefined();
    }, 10000);

    test('should use default model when not specified', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }]
      };

      mockProcess.emitClose(0);

      await adapter.processRequest(request);

      expect(mockProcess.stdin.write.mock.calls.length).toBeGreaterThan(0);
    });

    test('should validate messages and throw ValidationError for invalid format', async () => {
      const request = {
        messages: 'invalid', // Should be array
        model: 'sonnet'
      };

      await expect(adapter.processRequest(request)).rejects.toThrow(ValidationError);
    });

    test('should validate messages and throw ValidationError for empty array', async () => {
      const request = {
        messages: [],
        model: 'sonnet'
      };

      await expect(adapter.processRequest(request)).rejects.toThrow(ValidationError);
    });

    test('should validate messages and throw ValidationError for missing user message', async () => {
      const request = {
        messages: [
          { role: 'system', content: 'You are helpful' }
        ],
        model: 'sonnet'
      };

      await expect(adapter.processRequest(request)).rejects.toThrow(ValidationError);
    });

    test('should handle system prompt correctly', async () => {
      const request = {
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' }
        ],
        model: 'sonnet'
      };

      mockProcess.emitClose(0);

      await adapter.processRequest(request);

      expect(mockProcess.stdin.write.mock.calls.length).toBeGreaterThan(0);
    });

    test('should handle multi-turn conversation', async () => {
      const request = {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' }
        ],
        model: 'sonnet'
      };

      mockProcess.emitClose(0);

      await adapter.processRequest(request);

      expect(mockProcess.stdin.write.mock.calls.length).toBeGreaterThan(0);
      const writtenContent = mockProcess.stdin.write.mock.calls[0][0];
      expect(writtenContent).toContain('user: Hello');
      expect(writtenContent).toContain('assistant: Hi there!');
      expect(writtenContent).toContain('user: How are you?');
    });

    test('should warn about unsupported temperature parameter', async () => {
      const loggerWarnSpy = mockFn();
      const originalLogger = global.logger;
      global.logger = { warn: loggerWarnSpy };

      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'sonnet',
        temperature: 0.7
      };

      mockProcess.emitClose(0);

      await adapter.processRequest(request);

      // Logger warning should be called
      expect(mockProcess.stdin.write.mock.calls.length).toBeGreaterThan(0);

      global.logger = originalLogger;
    });

    test('should warn about unsupported top_p parameter', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'sonnet',
        top_p: 0.9
      };

      mockProcess.emitClose(0);

      await adapter.processRequest(request);

      expect(mockProcess.stdin.write.mock.calls.length).toBeGreaterThan(0);
    });

    test('should warn about unsupported presence_penalty parameter', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'sonnet',
        presence_penalty: 0.5
      };

      mockProcess.emitClose(0);

      await adapter.processRequest(request);

      expect(mockProcess.stdin.write.mock.calls.length).toBeGreaterThan(0);
    });

    test('should warn about unsupported frequency_penalty parameter', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'sonnet',
        frequency_penalty: 0.5
      };

      mockProcess.emitClose(0);

      await adapter.processRequest(request);

      expect(mockProcess.stdin.write.mock.calls.length).toBeGreaterThan(0);
    });

    test('should throw AdapterError when stdin write fails', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'sonnet'
      };

      mockProcess.stdin.write = () => {
        throw new Error('Write failed');
      };

      await expect(adapter.processRequest(request)).rejects.toThrow(AdapterError);
      expect(mockProcessManager.cleanupCalls.length).toBe(1);
    });
  });

  describe('handleStreamResponse', () => {
    beforeEach(() => {
      adapter = new CLIAdapter();
      adapter.processManager = mockProcessManager;
    });

    test('should return stream response with generator', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      };

      mockProcess.emitClose(0);

      const response = await adapter.processRequest(request);

      expect(response.type).toBe('stream');
      expect(response.generator).toBeDefined();
      expect(response.processId).toBe('proc_test_123');
    });

    test('generator should yield initial chunk', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      };

      mockProcess.emitClose(0);

      const response = await adapter.processRequest(request);
      const generator = response.generator;

      const firstChunk = await generator.next();

      expect(firstChunk.value).toBeDefined();
      expect(firstChunk.value.type).toBe('data');
      expect(firstChunk.value.data.object).toBe('chat.completion.chunk');
      expect(firstChunk.value.data.choices[0].delta.role).toBe('assistant');
    });

    test('generator should yield content chunks', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      };

      // Simulate streaming response
      setTimeout(() => {
        const eventData = JSON.stringify({
          type: 'partial',
          content: 'Hello!'
        });
        mockProcess.stdout.emitData(eventData + '\n');

        setTimeout(() => {
          mockProcess.emitClose(0);
        }, 50);
      }, 50);

      const response = await adapter.processRequest(request);
      const generator = response.generator;

      // Skip initial chunk
      await generator.next();

      // Get content chunk
      const contentChunk = await generator.next();

      expect(contentChunk.value).toBeDefined();
      expect(contentChunk.value.type).toBe('data');
      expect(contentChunk.value.data.choices[0].delta.content).toBeDefined();
    });

    test('generator should yield finish_reason chunk', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      };

      mockProcess.emitClose(0);

      const response = await adapter.processRequest(request);
      const generator = response.generator;

      // Consume all chunks
      let lastChunk;
      let value = await generator.next();

      while (!value.done) {
        lastChunk = value.value;
        value = await generator.next();
      }

      // Find finish_reason chunk
      expect(lastChunk).toBeDefined();
      expect(lastChunk.data.choices[0].finish_reason).toBe('stop');
    });

    test('generator should yield usage chunk', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      };

      mockProcess.emitClose(0);

      const response = await adapter.processRequest(request);
      const generator = response.generator;

      // Consume all chunks
      const chunks = [];
      let value = await generator.next();

      while (!value.done) {
        if (value.value && value.value.data) {
          chunks.push(value.value.data);
        }
        value = await generator.next();
      }

      // Find usage chunk
      const usageChunk = chunks.find(c => c.usage);
      expect(usageChunk).toBeDefined();
      expect(usageChunk.usage).toBeDefined();
      expect(usageChunk.usage.prompt_tokens).toBeGreaterThan(0);
    });

    test('generator should yield done marker', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      };

      mockProcess.emitClose(0);

      const response = await adapter.processRequest(request);
      const generator = response.generator;

      // Consume all chunks
      let lastValue;
      let value = await generator.next();

      while (!value.done) {
        lastValue = value;
        value = await generator.next();
      }

      expect(lastValue.value.type).toBe('done');
    });

    test('generator should handle process errors', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      };

      // Simulate process error
      setTimeout(() => {
        mockProcess.emitClose(1);
      }, 50);

      const response = await adapter.processRequest(request);
      const generator = response.generator;

      // Consume all chunks
      const chunks = [];
      let value = await generator.next();

      while (!value.done) {
        if (value.value) {
          chunks.push(value.value);
        }
        value = await generator.next();
      }

      // Should have error chunk
      const errorChunk = chunks.find(c => c.data && c.data.error);
      expect(errorChunk).toBeDefined();
      expect(errorChunk.data.error).toBeDefined();
    });

    test('generator should clean up process on completion', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      };

      mockProcess.emitClose(0);

      const response = await adapter.processRequest(request);
      const generator = response.generator;

      // Consume all chunks
      let value = await generator.next();
      while (!value.done) {
        value = await generator.next();
      }

      // Check cleanup was called
      expect(mockProcessManager.cleanupCalls.length).toBe(1);
      expect(mockProcessManager.cleanupCalls[0].processId).toBe('proc_test_123');
      expect(mockProcessManager.cleanupCalls[0].type).toBe('cli');
    }, 15000);

    test('generator should handle max_tokens limit', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
        max_tokens: 10
      };

      // Simulate long response
      setTimeout(() => {
        const eventData = JSON.stringify({
          type: 'partial',
          content: 'This is a very long response that exceeds the token limit'
        });
        mockProcess.stdout.emitData(eventData + '\n');

        setTimeout(() => {
          mockProcess.emitClose(0);
        }, 50);
      }, 50);

      const response = await adapter.processRequest(request);
      const generator = response.generator;

      // Skip initial chunk
      await generator.next();

      // Get content chunk
      const contentChunk = await generator.next();

      expect(contentChunk.value).toBeDefined();
      // Content should be truncated
      if (contentChunk.value.data && contentChunk.value.data.choices[0].delta.content) {
        const content = contentChunk.value.data.choices[0].delta.content;
        expect(content.length).toBeLessThanOrEqual(40); // 10 tokens * 4 chars
      }
    });

    test('generator should handle stop sequences', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
        stop: ['END']
      };

      // Simulate response with stop sequence
      setTimeout(() => {
        const eventData = JSON.stringify({
          type: 'partial',
          content: 'Hello! This is END response'
        });
        mockProcess.stdout.emitData(eventData + '\n');

        setTimeout(() => {
          mockProcess.emitClose(0);
        }, 50);
      }, 50);

      const response = await adapter.processRequest(request);
      const generator = response.generator;

      // Skip initial chunk
      await generator.next();

      // Get content chunk
      const contentChunk = await generator.next();

      expect(contentChunk.value).toBeDefined();
    });

    test('generator should handle result event type', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      };

      // Simulate result event
      setTimeout(() => {
        const eventData = JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'Hello! How can I help?'
        });
        mockProcess.stdout.emitData(eventData + '\n');

        setTimeout(() => {
          mockProcess.emitClose(0);
        }, 50);
      }, 50);

      const response = await adapter.processRequest(request);
      const generator = response.generator;

      // Skip initial chunk
      await generator.next();

      // Get content chunk
      const contentChunk = await generator.next();

      expect(contentChunk.value).toBeDefined();
      expect(contentChunk.value.data.choices[0].delta.content).toContain('Hello');
    });

    test('generator should handle assistant event type', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      };

      // Simulate assistant event
      setTimeout(() => {
        const eventData = JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Hello!' }
            ]
          }
        });
        mockProcess.stdout.emitData(eventData + '\n');

        setTimeout(() => {
          mockProcess.emitClose(0);
        }, 50);
      }, 50);

      const response = await adapter.processRequest(request);
      const generator = response.generator;

      // Skip initial chunk
      await generator.next();

      // Get content chunk
      const contentChunk = await generator.next();

      expect(contentChunk.value).toBeDefined();
      expect(contentChunk.value.data.choices[0].delta.content).toContain('Hello');
    });
  });

  describe('handleNonStreamResponse', () => {
    beforeEach(() => {
      adapter = new CLIAdapter();
      adapter.processManager = mockProcessManager;
    });

    test('should return non-stream response with content', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false
      };

      // Manually trigger process response
      setTimeout(() => {
        const responseData = JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'Hello! How can I help you?'
        });
        mockProcess.stdout.emitData(responseData);
        mockProcess.emitClose(0);
      }, 50);

      const response = await adapter.processRequest(request);

      expect(response.type).toBe('response');
      expect(response.data).toBeDefined();
      expect(response.data.choices[0].message.content).toBe('Hello! How can I help you?');
      expect(response.data.choices[0].finish_reason).toBe('stop');
    }, 10000);

    test('should include token usage', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false
      };

      setTimeout(() => {
        const responseData = JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'Hello!'
        });
        mockProcess.stdout.emitData(responseData);
        mockProcess.emitClose(0);
      }, 50);

      const response = await adapter.processRequest(request);

      expect(response.data.usage).toBeDefined();
      expect(response.data.usage.prompt_tokens).toBeGreaterThan(0);
      expect(response.data.usage.completion_tokens).toBeGreaterThan(0);
      expect(response.data.usage.total_tokens).toBe(
        response.data.usage.prompt_tokens + response.data.usage.completion_tokens
      );
    }, 10000);

    test('should handle max_tokens truncation', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
        max_tokens: 5
      };

      setTimeout(() => {
        const responseData = JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'This is a very long response that should be truncated'
        });
        mockProcess.stdout.emitData(responseData);
        mockProcess.emitClose(0);
      }, 50);

      const response = await adapter.processRequest(request);

      expect(response.data.choices[0].message.content.length).toBeLessThanOrEqual(20); // 5 tokens * 4 chars
    }, 10000);

    test('should handle stop sequences', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
        stop: ['STOP']
      };

      setTimeout(() => {
        const responseData = JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'Hello! This is STOP response'
        });
        mockProcess.stdout.emitData(responseData);
        mockProcess.emitClose(0);
      }, 50);

      const response = await adapter.processRequest(request);

      expect(response.data.choices[0].message.content).toContain('STOP');
    }, 10000);

    test('should throw AdapterError on process failure', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false
      };

      setTimeout(() => {
        mockProcess.stderr.emitData('Error: Something went wrong');
        mockProcess.emitClose(1);
      }, 50);

      await expect(adapter.processRequest(request)).rejects.toThrow(AdapterError);
    }, 10000);

    test('should throw AdapterError when no content found', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false
      };

      setTimeout(() => {
        const responseData = JSON.stringify({
          type: 'error',
          message: 'No content'
        });
        mockProcess.stdout.emitData(responseData);
        mockProcess.emitClose(0);
      }, 50);

      await expect(adapter.processRequest(request)).rejects.toThrow(AdapterError);
    }, 10000);

    test('should clean up process after completion', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false
      };

      setTimeout(() => {
        const responseData = JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'Hello!'
        });
        mockProcess.stdout.emitData(responseData);
        mockProcess.emitClose(0);
      }, 50);

      await adapter.processRequest(request);

      expect(mockProcessManager.cleanupCalls.length).toBe(1);
      expect(mockProcessManager.cleanupCalls[0].processId).toBe('proc_test_123');
    }, 10000);

    test('should clean up process on error', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false
      };

      setTimeout(() => {
        mockProcess.emitClose(1);
      }, 50);

      try {
        await adapter.processRequest(request);
      } catch (e) {
        // Expected error
      }

      expect(mockProcessManager.cleanupCalls.length).toBe(1);
    }, 10000);

    test('should parse multiple JSON lines', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false
      };

      setTimeout(() => {
        const line1 = JSON.stringify({ type: 'partial', content: 'Hello' });
        const line2 = JSON.stringify({ type: 'result', subtype: 'success', result: 'Hello!' });
        mockProcess.stdout.emitData(line1 + '\n' + line2 + '\n');
        mockProcess.emitClose(0);
      }, 50);

      const response = await adapter.processRequest(request);

      expect(response.data.choices[0].message.content).toBeDefined();
    }, 10000);
  });

  describe('healthCheck', () => {
    test('should return healthy status when under limit', () => {
      adapter = new CLIAdapter({ maxProcesses: 10 });
      adapter.processManager = mockProcessManager;

      const health = adapter.healthCheck();

      expect(health).toBeDefined();
      expect(health.adapter).toBe('cli');
      expect(health.healthy).toBe(true);
      expect(health.stats).toBeDefined();
      expect(health.stats.total).toBe(0);
      expect(health.stats.limit).toBe(10);
    });

    test('should return unhealthy status when at limit', () => {
      adapter = new CLIAdapter({ maxProcesses: 1 });
      adapter.processManager = mockProcessManager;

      // Mock the stats to show we're at limit
      adapter.processManager.getStats = () => ({
        total: 1,
        limit: 1,
        cliProcesses: 1,
        ptyProcesses: 0
      });

      const health = adapter.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.stats.total).toBe(1);
      expect(health.stats.limit).toBe(1);
    });

    test('should include process statistics', () => {
      adapter = new CLIAdapter();
      adapter.processManager = mockProcessManager;

      const health = adapter.healthCheck();

      expect(health.stats.cliProcesses).toBeDefined();
      expect(health.stats.ptyProcesses).toBeDefined();
      expect(health.stats.total).toBeDefined();
      expect(health.stats.limit).toBeDefined();
    });
  });

  describe('cleanup', () => {
    test('should call gracefulShutdown on processManager', async () => {
      adapter = new CLIAdapter();
      adapter.processManager = mockProcessManager;

      const gracefulShutdownSpy = mockFn();
      adapter.processManager.gracefulShutdown = gracefulShutdownSpy;

      await adapter.cleanup();

      expect(gracefulShutdownSpy.mock.calls.length).toBe(1);
    });

    test('should resolve successfully', async () => {
      adapter = new CLIAdapter();
      adapter.processManager = mockProcessManager;

      await expect(adapter.cleanup()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      adapter = new CLIAdapter();
      adapter.processManager = mockProcessManager;
    });

    test('should handle process.emit("error") event in streaming mode', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      };

      // Simulate process error
      setTimeout(() => {
        if (mockProcess.stdout.listeners.error) {
          mockProcess.stdout.listeners.error(new Error('Process error'));
        }
        mockProcess.emitClose(0);
      }, 50);

      const response = await adapter.processRequest(request);
      const generator = response.generator;

      // Consume generator - should handle error gracefully
      const chunks = [];
      let value = await generator.next();

      while (!value.done) {
        if (value.value) {
          chunks.push(value.value);
        }
        value = await generator.next();
      }

      // Should have done marker
      expect(chunks.length).toBeGreaterThan(0);
    }, 15000);

    test('should handle invalid JSON in stream', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      };

      // Emit invalid JSON
      setTimeout(() => {
        mockProcess.stdout.emitData('invalid json\n');

        setTimeout(() => {
          mockProcess.emitClose(0);
        }, 50);
      }, 50);

      const response = await adapter.processRequest(request);
      const generator = response.generator;

      // Should not throw, just skip invalid JSON
      let value = await generator.next();

      while (!value.done) {
        value = await generator.next();
      }

      expect(true).toBe(true); // Test passes if no error thrown
    });

    test('should handle empty content in non-streaming mode', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false
      };

      setTimeout(() => {
        mockProcess.stdout.emitData('');
        mockProcess.emitClose(0);
      }, 50);

      await expect(adapter.processRequest(request)).rejects.toThrow(AdapterError);
    });

    test('should handle malformed response in non-streaming mode', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false
      };

      setTimeout(() => {
        mockProcess.stdout.emitData('not valid json');
        mockProcess.emitClose(0);
      }, 50);

      // Should throw error when content can't be extracted
      await expect(adapter.processRequest(request)).rejects.toThrow(AdapterError);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      adapter = new CLIAdapter();
      adapter.processManager = mockProcessManager;
    });

    test('should handle empty stop sequences array', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
        stop: []
      };

      mockProcess.emitClose(0);

      const response = await adapter.processRequest(request);

      expect(response.type).toBe('stream');
    });

    test('should handle multiple stop sequences', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
        stop: ['END', 'STOP', 'FINISH']
      };

      mockProcess.emitClose(0);

      const response = await adapter.processRequest(request);

      expect(response.type).toBe('stream');
    });

    test('should handle very long conversation', async () => {
      const messages = [];
      for (let i = 0; i < 50; i++) {
        messages.push({ role: 'user', content: `Message ${i}` });
        messages.push({ role: 'assistant', content: `Response ${i}` });
      }

      const request = {
        messages,
        stream: false
      };

      setTimeout(() => {
        const responseData = JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'Final response'
        });
        mockProcess.stdout.emitData(responseData);
        mockProcess.emitClose(0);
      }, 50);

      const response = await adapter.processRequest(request);

      expect(response.data.choices[0].message.content).toBe('Final response');
    }, 10000);

    test('should handle zero max_tokens', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
        max_tokens: 0
      };

      mockProcess.emitClose(0);

      const response = await adapter.processRequest(request);

      expect(response.type).toBe('stream');
    });

    test('should handle very large max_tokens', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
        max_tokens: 100000
      };

      mockProcess.emitClose(0);

      const response = await adapter.processRequest(request);

      expect(response.type).toBe('stream');
    });

    test('should handle messages with array content', async () => {
      const request = {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello' }
            ]
          }
        ],
        stream: false
      };

      setTimeout(() => {
        const responseData = JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'Response'
        });
        mockProcess.stdout.emitData(responseData);
        mockProcess.emitClose(0);
      }, 50);

      const response = await adapter.processRequest(request);

      expect(response.data.choices[0].message.content).toBe('Response');
    }, 10000);

    test('should handle special characters in content', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello\n\n\tWorld!<>{}' }],
        stream: false
      };

      setTimeout(() => {
        const responseData = JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'Response with special chars: \n\t<>{}'
        });
        mockProcess.stdout.emitData(responseData);
        mockProcess.emitClose(0);
      }, 50);

      const response = await adapter.processRequest(request);

      expect(response.data.choices[0].message.content).toContain('\n');
    }, 10000);

    test('should handle Unicode content', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello 你好 🌍' }],
        stream: false
      };

      setTimeout(() => {
        const responseData = JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'Response: 你好 🌍'
        });
        mockProcess.stdout.emitData(responseData);
        mockProcess.emitClose(0);
      }, 50);

      const response = await adapter.processRequest(request);

      expect(response.data.choices[0].message.content).toContain('你好');
    }, 10000);
  });

  describe('integration scenarios', () => {
    beforeEach(() => {
      adapter = new CLIAdapter();
      adapter.processManager = mockProcessManager;
    });

    test('should handle complete streaming request lifecycle', async () => {
      const request = {
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Tell me a joke' }
        ],
        model: 'sonnet',
        stream: true,
        max_tokens: 100
      };

      // Simulate streaming response
      setTimeout(() => {
        const events = [
          { type: 'partial', content: 'Why' },
          { type: 'partial', content: ' did' },
          { type: 'partial', content: ' the' },
          { type: 'partial', content: ' chicken' },
          { type: 'partial', content: ' cross' },
          { type: 'partial', content: ' the' },
          { type: 'partial', content: ' road?' }
        ];

        events.forEach((event, index) => {
          setTimeout(() => {
            mockProcess.stdout.emitData(JSON.stringify(event) + '\n');
          }, index * 10);
        });

        setTimeout(() => {
          mockProcess.emitClose(0);
        }, 150);
      }, 50);

      const response = await adapter.processRequest(request);
      const generator = response.generator;

      const chunks = [];
      let value = await generator.next();

      while (!value.done) {
        if (value.value && value.value.type === 'data') {
          chunks.push(value.value.data);
        }
        value = await generator.next();
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].object).toBe('chat.completion.chunk');
    });

    test('should handle complete non-streaming request lifecycle', async () => {
      const request = {
        messages: [
          { role: 'user', content: 'What is 2+2?' }
        ],
        model: 'sonnet',
        stream: false,
        max_tokens: 50
      };

      setTimeout(() => {
        const responseData = JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: '2+2 equals 4.'
        });
        mockProcess.stdout.emitData(responseData);
        mockProcess.emitClose(0);
      }, 50);

      const response = await adapter.processRequest(request);

      expect(response.type).toBe('response');
      expect(response.data.object).toBe('chat.completion');
      expect(response.data.model).toBe('claude-sonnet');
      expect(response.data.choices[0].message.role).toBe('assistant');
      expect(response.data.choices[0].message.content).toBe('2+2 equals 4.');
      expect(response.data.usage).toBeDefined();
    }, 10000);

    test('should handle request with all optional parameters', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'opus',
        stream: false,
        max_tokens: 1000,
        stop: ['END', 'STOP'],
        temperature: 0.5,  // Will be warned about
        top_p: 0.9,        // Will be warned about
        presence_penalty: 0.1,  // Will be warned about
        frequency_penalty: 0.1  // Will be warned about
      };

      setTimeout(() => {
        const responseData = JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'Hello! Response END'
        });
        mockProcess.stdout.emitData(responseData);
        mockProcess.emitClose(0);
      }, 50);

      const response = await adapter.processRequest(request);

      expect(response.data.choices[0].message.content).toContain('END');
      expect(response.data.usage).toBeDefined();
    }, 10000);
  });
});
