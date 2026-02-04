/**
 * Logger Unit Tests
 */

import { Logger, logger } from '../../../lib/utils/logger.js';

describe('Logger', () => {
  let originalError;
  let consoleOutput;

  beforeEach(() => {
    // Capture console.error output
    originalError = console.error;
    consoleOutput = [];
    console.error = (...args) => {
      consoleOutput.push(args.join(' '));
    };
  });

  afterEach(() => {
    // Restore console.error
    console.error = originalError;
  });

  describe('Logger class', () => {
    test('should create logger with default level', () => {
      const log = new Logger();
      expect(log.level).toBe('info');
    });

    test('should create logger with custom level', () => {
      const log = new Logger({ level: 'debug' });
      expect(log.level).toBe('debug');
    });

    test('should create logger with prefix', () => {
      const log = new Logger({ prefix: 'Test' });
      expect(log.prefix).toBe('Test');
    });

    test('should log debug messages when level is debug', () => {
      const log = new Logger({ level: 'debug' });
      log.debug('test message');
      expect(consoleOutput.length).toBe(1);
      expect(consoleOutput[0]).toContain('DEBUG');
      expect(consoleOutput[0]).toContain('test message');
    });

    test('should not log debug messages when level is info', () => {
      const log = new Logger({ level: 'info' });
      log.debug('test message');
      expect(consoleOutput.length).toBe(0);
    });

    test('should log info messages when level is info', () => {
      const log = new Logger({ level: 'info' });
      log.info('test message');
      expect(consoleOutput.length).toBe(1);
      expect(consoleOutput[0]).toContain('INFO');
      expect(consoleOutput[0]).toContain('test message');
    });

    test('should log warn messages', () => {
      const log = new Logger({ level: 'info' });
      log.warn('test warning');
      expect(consoleOutput.length).toBe(1);
      expect(consoleOutput[0]).toContain('WARN');
      expect(consoleOutput[0]).toContain('test warning');
    });

    test('should log error messages', () => {
      const log = new Logger({ level: 'info' });
      log.error('test error');
      expect(consoleOutput.length).toBe(1);
      expect(consoleOutput[0]).toContain('ERROR');
      expect(consoleOutput[0]).toContain('test error');
    });

    test('should include metadata in logs', () => {
      const log = new Logger({ level: 'info' });
      log.info('test message', { key: 'value' });
      expect(consoleOutput.length).toBe(1);
      expect(consoleOutput[0]).toContain('"key":"value"');
    });

    test('should include prefix in logs', () => {
      const log = new Logger({ level: 'info', prefix: 'PREFIX' });
      log.info('test message');
      expect(consoleOutput.length).toBe(1);
      expect(consoleOutput[0]).toContain('[PREFIX]');
    });
  });

  describe('Default logger instance', () => {
    test('should export default logger instance', () => {
      expect(logger).toBeInstanceOf(Logger);
    });

    test('should use LOG_LEVEL from environment', () => {
      const originalLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'debug';

      const log = new Logger();
      expect(log.level).toBe('debug');

      process.env.LOG_LEVEL = originalLevel;
    });
  });
});
