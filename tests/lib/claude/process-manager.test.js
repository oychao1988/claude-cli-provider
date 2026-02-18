/**
 * ProcessManager Unit Tests
 */

import { ProcessManager } from '../../../lib/claude/process-manager.js';

// Simple mock function
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

// Make mockFn available globally
global.jest = {
  fn: mockFn
};

// Create a mock ChildProcess
class MockChildProcess {
  constructor(pid = 12345) {
    this.pid = pid;
    this.killed = false;
    this.listeners = {};
    this.exitCode = null;
    this.signalCode = null;
  }

  on(event, callback) {
    this.listeners[event] = callback;
    return this;
  }

  emit(event, ...args) {
    const callback = this.listeners[event];
    if (callback) {
      callback(...args);
    }
  }

  kill(signal) {
    this.killed = true;
    this.signalCode = signal;

    // Trigger exit event asynchronously
    setImmediate(() => {
      if (this.listeners.exit) {
        const exitCode = signal === 'SIGKILL' ? null : 0;
        this.listeners.exit(exitCode, signal);
      }
    });
  }

  removeAllListeners() {
    this.listeners = {};
  }
}

describe('ProcessManager', () => {
  describe('constructor', () => {
    test('should initialize with defaults', () => {
      const manager = new ProcessManager();
      expect(manager.claudeBin).toBe('claude');
      expect(manager.maxProcesses).toBe(10);
    });

    test('should initialize with config', () => {
      const manager = new ProcessManager({
        claudeBin: 'claude-test',
        maxProcesses: 5
      });
      expect(manager.claudeBin).toBe('claude-test');
      expect(manager.maxProcesses).toBe(5);
    });

    test('should use CLAUDE_BIN env variable', () => {
      const originalBin = process.env.CLAUDE_BIN;
      process.env.CLAUDE_BIN = 'claude-env';

      const manager = new ProcessManager();
      expect(manager.claudeBin).toBe('claude-env');

      process.env.CLAUDE_BIN = originalBin;
    });
  });

  describe('generateId', () => {
    test('should generate unique process IDs', () => {
      const manager = new ProcessManager();
      const id1 = manager.generateId();
      const id2 = manager.generateId();

      expect(id1).toMatch(/^proc_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^proc_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    test('should generate IDs with timestamp', () => {
      const manager = new ProcessManager();
      const before = Date.now();
      const id = manager.generateId();
      const after = Date.now();

      const timestamp = parseInt(id.split('_')[1]);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    test('should generate IDs with random component', () => {
      const manager = new ProcessManager();
      const ids = new Set();

      for (let i = 0; i < 100; i++) {
        ids.add(manager.generateId());
      }

      // Should generate 100 unique IDs
      expect(ids.size).toBe(100);
    });
  });

  describe('getStats', () => {
    test('should return correct stats', () => {
      const manager = new ProcessManager({
        claudeBin: 'claude-test',
        maxProcesses: 5
      });

      const stats = manager.getStats();
      expect(stats.cliProcesses).toBe(0);
      expect(stats.ptyProcesses).toBe(0);
      expect(stats.total).toBe(0);
      expect(stats.limit).toBe(5);
    });
  });

  describe('healthCheck', () => {
    test('should report healthy when under limit', () => {
      const manager = new ProcessManager();
      const health = manager.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.stats.total).toBe(0);
    });

    test('should detect zombie processes (no pid)', () => {
      const manager = new ProcessManager();

      // Manually add a zombie process
      const zombieProcess = new MockChildProcess();
      zombieProcess.pid = null;
      const zombieId = manager.generateId();
      manager.cliProcesses.set(zombieId, zombieProcess);

      const health = manager.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.zombieProcesses).toContain(zombieId);
      expect(health.zombieProcesses.length).toBe(1);

      // Cleanup
      manager.cliProcesses.delete(zombieId);
    });

    test('should detect zombie processes (killed)', () => {
      const manager = new ProcessManager();

      // Manually add a killed process
      const zombieProcess = new MockChildProcess();
      zombieProcess.killed = true;
      const zombieId = manager.generateId();
      manager.cliProcesses.set(zombieId, zombieProcess);

      const health = manager.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.zombieProcesses).toContain(zombieId);

      // Cleanup
      manager.cliProcesses.delete(zombieId);
    });

    test('should report unhealthy when at limit', () => {
      const manager = new ProcessManager({ maxProcesses: 2 });

      // Add processes up to limit
      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());
      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());

      const health = manager.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.stats.total).toBe(2);
      expect(health.stats.limit).toBe(2);
    });

    test('should return correct stats with both process types', async () => {
      const manager = new ProcessManager();

      // Add CLI processes
      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());
      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());

      // Add PTY processes
      manager.ptyProcesses.set(manager.generateId(), new MockChildProcess());

      const health = manager.healthCheck();

      expect(health.stats.cliProcesses).toBe(2);
      expect(health.stats.ptyProcesses).toBe(1);
      expect(health.stats.total).toBe(3);
    });

    test('should detect zombie PTY processes (no pid)', () => {
      const manager = new ProcessManager();

      // Manually add a zombie PTY process
      const zombieProcess = new MockChildProcess();
      zombieProcess.pid = null;
      const zombieId = manager.generateId();
      manager.ptyProcesses.set(zombieId, zombieProcess);

      const health = manager.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.zombieProcesses).toContain(zombieId);
      expect(health.zombieProcesses.length).toBe(1);

      // Cleanup
      manager.ptyProcesses.delete(zombieId);
    });

    test('should detect zombie PTY processes (killed)', () => {
      const manager = new ProcessManager();

      // Manually add a killed PTY process
      const zombieProcess = new MockChildProcess();
      zombieProcess.killed = true;
      const zombieId = manager.generateId();
      manager.ptyProcesses.set(zombieId, zombieProcess);

      const health = manager.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.zombieProcesses).toContain(zombieId);

      // Cleanup
      manager.ptyProcesses.delete(zombieId);
    });

    test('should detect zombie processes in both pools', () => {
      const manager = new ProcessManager();

      // Add zombie CLI process
      const cliZombie = new MockChildProcess();
      cliZombie.killed = true;
      const cliZombieId = manager.generateId();
      manager.cliProcesses.set(cliZombieId, cliZombie);

      // Add zombie PTY process
      const ptyZombie = new MockChildProcess();
      ptyZombie.pid = null;
      const ptyZombieId = manager.generateId();
      manager.ptyProcesses.set(ptyZombieId, ptyZombie);

      const health = manager.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.zombieProcesses.length).toBe(2);
      expect(health.zombieProcesses).toContain(cliZombieId);
      expect(health.zombieProcesses).toContain(ptyZombieId);

      // Cleanup
      manager.cliProcesses.delete(cliZombieId);
      manager.ptyProcesses.delete(ptyZombieId);
    });
  });

  describe('cleanupAll', () => {
    test('should clean up all processes', () => {
      const manager = new ProcessManager();
      const count = manager.cleanupAll('all');
      expect(count).toBe(0);
    });

    test('should clean up all CLI processes', () => {
      const manager = new ProcessManager();

      // Add multiple processes
      const id1 = manager.generateId();
      const id2 = manager.generateId();
      const id3 = manager.generateId();

      manager.cliProcesses.set(id1, new MockChildProcess());
      manager.cliProcesses.set(id2, new MockChildProcess());
      manager.cliProcesses.set(id3, new MockChildProcess());

      expect(manager.cliProcesses.size).toBe(3);

      const count = manager.cleanupAll('cli');

      expect(count).toBe(3);
      expect(manager.cliProcesses.size).toBe(0);
    });

    test('should clean up all PTY processes', () => {
      const manager = new ProcessManager();

      // Add multiple PTY processes
      const id1 = manager.generateId();
      const id2 = manager.generateId();

      manager.ptyProcesses.set(id1, new MockChildProcess());
      manager.ptyProcesses.set(id2, new MockChildProcess());

      expect(manager.ptyProcesses.size).toBe(2);

      const count = manager.cleanupAll('pty');

      expect(count).toBe(2);
      expect(manager.ptyProcesses.size).toBe(0);
    });

    test('should clean up all processes (both types)', () => {
      const manager = new ProcessManager();

      // Add CLI processes
      const cliId1 = manager.generateId();
      const cliId2 = manager.generateId();
      manager.cliProcesses.set(cliId1, new MockChildProcess());
      manager.cliProcesses.set(cliId2, new MockChildProcess());

      // Add PTY processes
      const ptyId = manager.generateId();
      manager.ptyProcesses.set(ptyId, new MockChildProcess());

      const count = manager.cleanupAll('all');

      expect(count).toBe(3);
      expect(manager.cliProcesses.size).toBe(0);
      expect(manager.ptyProcesses.size).toBe(0);
    });

    test('should handle errors when killing CLI processes', () => {
      const manager = new ProcessManager();

      // Create processes that throw on kill
      const errorProcess1 = new MockChildProcess();
      errorProcess1.kill = () => { throw new Error('Kill failed 1'); };

      const errorProcess2 = new MockChildProcess();
      errorProcess2.kill = () => { throw new Error('Kill failed 2'); };

      manager.cliProcesses.set(manager.generateId(), errorProcess1);
      manager.cliProcesses.set(manager.generateId(), errorProcess2);

      // Should not throw despite kill errors
      const count = manager.cleanupAll('cli');

      expect(count).toBe(2);
      expect(manager.cliProcesses.size).toBe(0);
    });

    test('should handle errors when killing PTY processes', () => {
      const manager = new ProcessManager();

      // Create processes that throw on kill
      const errorProcess1 = new MockChildProcess();
      errorProcess1.kill = () => { throw new Error('Kill failed 1'); };

      const errorProcess2 = new MockChildProcess();
      errorProcess2.kill = () => { throw new Error('Kill failed 2'); };

      manager.ptyProcesses.set(manager.generateId(), errorProcess1);
      manager.ptyProcesses.set(manager.generateId(), errorProcess2);

      // Should not throw despite kill errors
      const count = manager.cleanupAll('pty');

      expect(count).toBe(2);
      expect(manager.ptyProcesses.size).toBe(0);
    });

    test('should return 0 when no processes to clean', () => {
      const manager = new ProcessManager();
      const count = manager.cleanupAll('cli');
      expect(count).toBe(0);
    });

    test('should only clean cli type when specified', () => {
      const manager = new ProcessManager();

      // Add both CLI and PTY processes
      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());
      manager.ptyProcesses.set(manager.generateId(), new MockChildProcess());

      const count = manager.cleanupAll('cli');

      expect(count).toBe(1);
      expect(manager.cliProcesses.size).toBe(0);
      expect(manager.ptyProcesses.size).toBe(1); // PTY should remain
    });

    test('should only clean pty type when specified', () => {
      const manager = new ProcessManager();

      // Add both CLI and PTY processes
      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());
      manager.ptyProcesses.set(manager.generateId(), new MockChildProcess());

      const count = manager.cleanupAll('pty');

      expect(count).toBe(1);
      expect(manager.ptyProcesses.size).toBe(0);
      expect(manager.cliProcesses.size).toBe(1); // CLI should remain
    });
  });

  describe('getProcess', () => {
    test('should return null for non-existent process', () => {
      const manager = new ProcessManager();
      const process = manager.getProcess('nonexistent', 'cli');
      expect(process).toBeNull();
    });

    test('should return existing CLI process', () => {
      const manager = new ProcessManager();
      const mockProcess = new MockChildProcess();
      const processId = manager.generateId();

      manager.cliProcesses.set(processId, mockProcess);

      const retrieved = manager.getProcess(processId, 'cli');

      expect(retrieved).toBe(mockProcess);
      expect(retrieved.pid).toBe(12345);
    });

    test('should return existing PTY process', () => {
      const manager = new ProcessManager();
      const mockProcess = new MockChildProcess();
      const processId = manager.generateId();

      manager.ptyProcesses.set(processId, mockProcess);

      const retrieved = manager.getProcess(processId, 'pty');

      expect(retrieved).toBe(mockProcess);
    });

    test('should return null for non-existent CLI process', () => {
      const manager = new ProcessManager();
      const process = manager.getProcess('nonexistent', 'cli');
      expect(process).toBeNull();
    });

    test('should return null for non-existent PTY process', () => {
      const manager = new ProcessManager();
      const process = manager.getProcess('nonexistent', 'pty');
      expect(process).toBeNull();
    });
  });

  describe('cleanup', () => {
    test('should return false for non-existent process', () => {
      const manager = new ProcessManager();
      const cleaned = manager.cleanup('nonexistent', 'cli');
      expect(cleaned).toBe(false);
    });

    test('should clean up CLI process successfully', () => {
      const manager = new ProcessManager();
      const mockProcess = new MockChildProcess();
      const processId = manager.generateId();

      manager.cliProcesses.set(processId, mockProcess);

      expect(manager.cliProcesses.has(processId)).toBe(true);

      const cleaned = manager.cleanup(processId, 'cli');

      expect(cleaned).toBe(true);
      expect(manager.cliProcesses.has(processId)).toBe(false);
    });

    test('should clean up PTY process successfully', () => {
      const manager = new ProcessManager();
      const mockProcess = new MockChildProcess();
      const processId = manager.generateId();

      manager.ptyProcesses.set(processId, mockProcess);

      expect(manager.ptyProcesses.has(processId)).toBe(true);

      const cleaned = manager.cleanup(processId, 'pty');

      expect(cleaned).toBe(true);
      expect(manager.ptyProcesses.has(processId)).toBe(false);
    });

    test('should handle cleanup errors gracefully', () => {
      const manager = new ProcessManager();

      // Create a process that throws on kill
      const errorProcess = new MockChildProcess();
      errorProcess.kill = () => {
        throw new Error('Kill failed');
      };

      const processId = manager.generateId();
      manager.cliProcesses.set(processId, errorProcess);

      // Should not throw, should handle error gracefully
      const cleaned = manager.cleanup(processId, 'cli');

      // Process should still be cleaned up despite error
      expect(cleaned).toBe(true);
      expect(manager.cliProcesses.has(processId)).toBe(false);
    });

    test('should return false for non-existent CLI process', () => {
      const manager = new ProcessManager();
      const cleaned = manager.cleanup('nonexistent', 'cli');
      expect(cleaned).toBe(false);
    });

    test('should return false for non-existent PTY process', () => {
      const manager = new ProcessManager();
      const cleaned = manager.cleanup('nonexistent', 'pty');
      expect(cleaned).toBe(false);
    });

    test('should handle force kill after timeout', (done) => {
      const manager = new ProcessManager();

      // Create a process that doesn't die immediately
      const mockProcess = new MockChildProcess();
      let killCount = 0;
      mockProcess.kill = (signal) => {
        killCount++;
        if (signal === 'SIGTERM') {
          // Don't actually kill, simulate hanging process
        } else if (signal === 'SIGKILL') {
          mockProcess.killed = true;
        }
      };

      const processId = manager.generateId();
      manager.cliProcesses.set(processId, mockProcess);

      manager.cleanup(processId, 'cli');

      // Check initial SIGTERM
      expect(killCount).toBeGreaterThanOrEqual(1);

      // Wait a bit and check process is removed
      setTimeout(() => {
        expect(manager.cliProcesses.has(processId)).toBe(false);
        done();
      }, 100);
    });
  });

  describe('createCLIProcess', () => {
    test('should throw error when process limit is reached', () => {
      const manager = new ProcessManager({ maxProcesses: 1 });

      // Add a process to reach limit
      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());

      // Try to create another process, should throw
      expect(() => {
        manager.createCLIProcess({ model: 'sonnet' });
      }).toThrow('Maximum process limit reached');
    });

    test('should handle process exit event manually', (done) => {
      const manager = new ProcessManager();

      // Manually add a CLI process (simulating what createCLIProcess does)
      const mockProcess = new MockChildProcess();
      const processId = manager.generateId();

      manager.cliProcesses.set(processId, mockProcess);

      expect(manager.cliProcesses.has(processId)).toBe(true);

      // Set up exit handler like createCLIProcess does
      mockProcess.on('exit', (code, signal) => {
        manager.cliProcesses.delete(processId);
      });

      // Simulate process exit
      mockProcess.emit('exit', 0, null);

      // Process should be removed from pool
      setTimeout(() => {
        expect(manager.cliProcesses.has(processId)).toBe(false);
        done();
      }, 10);
    });

    test('should handle process error event manually', (done) => {
      const manager = new ProcessManager();

      // Manually add a CLI process
      const mockProcess = new MockChildProcess();
      const processId = manager.generateId();

      manager.cliProcesses.set(processId, mockProcess);

      expect(manager.cliProcesses.has(processId)).toBe(true);

      // Set up error handler like createCLIProcess does
      mockProcess.on('error', (error) => {
        manager.cliProcesses.delete(processId);
      });

      // Simulate process error
      mockProcess.emit('error', new Error('Process failed'));

      // Process should be removed from pool
      setTimeout(() => {
        expect(manager.cliProcesses.has(processId)).toBe(false);
        done();
      }, 10);
    });
  });

  describe('createPTYProcess', () => {
    test('should throw error when PTY process limit is reached', async () => {
      const manager = new ProcessManager({ maxProcesses: 1 });

      // Add a process to reach limit
      manager.ptyProcesses.set(manager.generateId(), new MockChildProcess());

      // Try to create another process, should throw
      await expect(async () => {
        await manager.createPTYProcess({ model: 'sonnet' });
      }).rejects.toThrow('Maximum PTY process limit reached');
    });

    test('should handle process exit event manually', (done) => {
      const manager = new ProcessManager();

      // Manually add a PTY process (simulating what createPTYProcess does)
      const mockProcess = new MockChildProcess();
      const processId = manager.generateId();

      manager.ptyProcesses.set(processId, mockProcess);

      expect(manager.ptyProcesses.has(processId)).toBe(true);

      // Set up exit handler like createPTYProcess does
      mockProcess.on('exit', ({ exitCode, signal }) => {
        manager.ptyProcesses.delete(processId);
      });

      // Manually trigger exit
      mockProcess.emit('exit', { exitCode: 0, signal: null });

      // Process should be removed from pool
      setTimeout(() => {
        expect(manager.ptyProcesses.has(processId)).toBe(false);
        done();
      }, 10);
    });

    test('should handle process error event manually', (done) => {
      const manager = new ProcessManager();

      // Manually add a PTY process
      const mockProcess = new MockChildProcess();
      const processId = manager.generateId();

      manager.ptyProcesses.set(processId, mockProcess);

      expect(manager.ptyProcesses.has(processId)).toBe(true);

      // Set up error handler like createPTYProcess does
      mockProcess.on('error', (error) => {
        manager.ptyProcesses.delete(processId);
      });

      // Manually trigger error
      mockProcess.emit('error', new Error('PTY error'));

      // Process should be removed from pool
      setTimeout(() => {
        expect(manager.ptyProcesses.has(processId)).toBe(false);
        done();
      }, 10);
    });
  });

  describe('gracefulShutdown', () => {
    test('should cleanup all processes on shutdown', async () => {
      const manager = new ProcessManager();

      // Add some processes
      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());
      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());
      manager.ptyProcesses.set(manager.generateId(), new MockChildProcess());

      await manager.gracefulShutdown();

      expect(manager.cliProcesses.size).toBe(0);
      expect(manager.ptyProcesses.size).toBe(0);
    });

    test('should handle empty process pool', async () => {
      const manager = new ProcessManager();

      await manager.gracefulShutdown();

      expect(manager.cliProcesses.size).toBe(0);
      expect(manager.ptyProcesses.size).toBe(0);
    });

    test('should complete within reasonable time', async () => {
      const manager = new ProcessManager();

      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());

      const startTime = Date.now();
      await manager.gracefulShutdown();
      const duration = Date.now() - startTime;

      // Should take about 1 second, not 10 seconds
      expect(duration).toBeLessThan(5000);
      expect(manager.cliProcesses.size).toBe(0);
    });

    test('should cleanup both cli and pty processes', async () => {
      const manager = new ProcessManager();

      // Add processes of both types
      const cliId1 = manager.generateId();
      const cliId2 = manager.generateId();
      const ptyId = manager.generateId();

      manager.cliProcesses.set(cliId1, new MockChildProcess());
      manager.cliProcesses.set(cliId2, new MockChildProcess());
      manager.ptyProcesses.set(ptyId, new MockChildProcess());

      expect(manager.cliProcesses.size).toBe(2);
      expect(manager.ptyProcesses.size).toBe(1);

      await manager.gracefulShutdown();

      expect(manager.cliProcesses.size).toBe(0);
      expect(manager.ptyProcesses.size).toBe(0);
    });

    test('should return promise', async () => {
      const manager = new ProcessManager();

      const result = manager.gracefulShutdown();

      expect(result).toBeInstanceOf(Promise);
      await result;
    });
  });

  describe('getStats', () => {
    test('should return accurate statistics', () => {
      const manager = new ProcessManager({ maxProcesses: 5 });

      // Add processes
      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());
      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());
      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());
      manager.ptyProcesses.set(manager.generateId(), new MockChildProcess());

      const stats = manager.getStats();

      expect(stats.cliProcesses).toBe(3);
      expect(stats.ptyProcesses).toBe(1);
      expect(stats.total).toBe(4);
      expect(stats.limit).toBe(5);
    });

    test('should calculate total correctly', () => {
      const manager = new ProcessManager();

      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());
      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());
      manager.ptyProcesses.set(manager.generateId(), new MockChildProcess());

      const stats = manager.getStats();

      expect(stats.total).toBe(stats.cliProcesses + stats.ptyProcesses);
    });
  });

  describe('integration tests', () => {
    test('should handle full process lifecycle', () => {
      const manager = new ProcessManager();
      const mockProcess = new MockChildProcess();
      const processId = manager.generateId();

      // Create
      manager.cliProcesses.set(processId, mockProcess);
      expect(manager.cliProcesses.has(processId)).toBe(true);

      // Get
      const retrieved = manager.getProcess(processId, 'cli');
      expect(retrieved).toBe(mockProcess);

      // Stats
      const stats = manager.getStats();
      expect(stats.cliProcesses).toBe(1);

      // Health
      const health = manager.healthCheck();
      expect(health.healthy).toBe(true);

      // Cleanup
      const cleaned = manager.cleanup(processId, 'cli');
      expect(cleaned).toBe(true);
      expect(manager.cliProcesses.has(processId)).toBe(false);

      // Stats after cleanup
      const finalStats = manager.getStats();
      expect(finalStats.cliProcesses).toBe(0);
    });

    test('should handle multiple processes concurrently', () => {
      const manager = new ProcessManager({ maxProcesses: 5 });
      const processIds = [];

      // Create multiple processes
      for (let i = 0; i < 3; i++) {
        const id = manager.generateId();
        manager.cliProcesses.set(id, new MockChildProcess());
        processIds.push(id);
      }

      expect(manager.cliProcesses.size).toBe(3);

      // Cleanup all
      const count = manager.cleanupAll('cli');
      expect(count).toBe(3);
      expect(manager.cliProcesses.size).toBe(0);
    });

    test('should handle PTY process lifecycle', () => {
      const manager = new ProcessManager();
      const mockProcess = new MockChildProcess();
      const processId = manager.generateId();

      // Create
      manager.ptyProcesses.set(processId, mockProcess);
      expect(manager.ptyProcesses.has(processId)).toBe(true);

      // Get
      const retrieved = manager.getProcess(processId, 'pty');
      expect(retrieved).toBe(mockProcess);

      // Stats
      const stats = manager.getStats();
      expect(stats.ptyProcesses).toBe(1);

      // Cleanup
      const cleaned = manager.cleanup(processId, 'pty');
      expect(cleaned).toBe(true);
      expect(manager.ptyProcesses.has(processId)).toBe(false);
    });

    test('should handle limit checking correctly', () => {
      const manager = new ProcessManager({ maxProcesses: 3 });

      // Add processes up to limit
      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());
      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());
      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());

      const health = manager.healthCheck();
      expect(health.stats.total).toBe(3);
      expect(health.stats.limit).toBe(3);
      expect(health.healthy).toBe(false); // At limit, not healthy
    });

    test('should handle process limit with both types', () => {
      const manager = new ProcessManager({ maxProcesses: 3 });

      // Add 2 CLI and 1 PTY processes
      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());
      manager.cliProcesses.set(manager.generateId(), new MockChildProcess());
      manager.ptyProcesses.set(manager.generateId(), new MockChildProcess());

      const stats = manager.getStats();
      expect(stats.total).toBe(3);
      expect(stats.limit).toBe(3);

      const health = manager.healthCheck();
      expect(health.healthy).toBe(false);
    });

    test('should cleanup individual process without affecting others', () => {
      const manager = new ProcessManager();

      // Add multiple processes
      const id1 = manager.generateId();
      const id2 = manager.generateId();
      const id3 = manager.generateId();

      manager.cliProcesses.set(id1, new MockChildProcess());
      manager.cliProcesses.set(id2, new MockChildProcess());
      manager.cliProcesses.set(id3, new MockChildProcess());

      expect(manager.cliProcesses.size).toBe(3);

      // Cleanup one process
      const cleaned = manager.cleanup(id2, 'cli');
      expect(cleaned).toBe(true);
      expect(manager.cliProcesses.size).toBe(2);
      expect(manager.cliProcesses.has(id1)).toBe(true);
      expect(manager.cliProcesses.has(id2)).toBe(false);
      expect(manager.cliProcesses.has(id3)).toBe(true);
    });

    test('should handle cleanupAll with mixed healthy and zombie processes', () => {
      const manager = new ProcessManager();

      // Add healthy processes
      const healthyId = manager.generateId();
      const healthyProcess = new MockChildProcess();
      manager.cliProcesses.set(healthyId, healthyProcess);

      // Add zombie processes
      const zombieId = manager.generateId();
      const zombieProcess = new MockChildProcess();
      zombieProcess.killed = true;
      manager.cliProcesses.set(zombieId, zombieProcess);

      expect(manager.cliProcesses.size).toBe(2);

      // Cleanup all should work regardless of health
      const count = manager.cleanupAll('cli');
      expect(count).toBe(2);
      expect(manager.cliProcesses.size).toBe(0);
    });
  });
});
