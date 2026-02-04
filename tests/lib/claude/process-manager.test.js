/**
 * ProcessManager Unit Tests
 */

import { ProcessManager } from '../../../lib/claude/process-manager.js';

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
  });

  describe('cleanupAll', () => {
    test('should clean up all processes', () => {
      const manager = new ProcessManager();
      const count = manager.cleanupAll('all');
      expect(count).toBe(0);
    });
  });

  describe('getProcess', () => {
    test('should return null for non-existent process', () => {
      const manager = new ProcessManager();
      const process = manager.getProcess('nonexistent', 'cli');
      expect(process).toBeNull();
    });
  });

  describe('cleanup', () => {
    test('should return false for non-existent process', () => {
      const manager = new ProcessManager();
      const cleaned = manager.cleanup('nonexistent', 'cli');
      expect(cleaned).toBe(false);
    });
  });

  describe('createPTYProcess', () => {
    test('should throw not implemented error', () => {
      const manager = new ProcessManager();
      expect(() => {
        manager.createPTYProcess({ model: 'sonnet' });
      }).toThrow('PTY mode not yet implemented');
    });
  });
});
