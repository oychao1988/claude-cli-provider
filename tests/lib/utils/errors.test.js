/**
 * Errors Unit Tests
 */

import {
  ClaudeCLIError,
  ProcessError,
  ValidationError,
  AuthenticationError,
  ParseError,
  AdapterError
} from '../../../lib/utils/errors.js';

describe('Custom Errors', () => {
  describe('ClaudeCLIError', () => {
    test('should create base error with message', () => {
      const error = new ClaudeCLIError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('ClaudeCLIError');
    });

    test('should create base error with details', () => {
      const details = { code: 500, info: 'test' };
      const error = new ClaudeCLIError('Test error', details);
      expect(error.details).toEqual(details);
    });

    test('should convert to JSON', () => {
      const error = new ClaudeCLIError('Test error', { code: 500 });
      const json = error.toJSON();
      expect(json).toEqual({
        name: 'ClaudeCLIError',
        message: 'Test error',
        details: { code: 500 }
      });
    });

    test('should have stack trace', () => {
      const error = new ClaudeCLIError('Test error');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ClaudeCLIError');
    });
  });

  describe('ProcessError', () => {
    test('should create process error', () => {
      const error = new ProcessError('Process failed');
      expect(error.name).toBe('ProcessError');
      expect(error.message).toBe('Process failed');
    });

    test('should accept process details', () => {
      const error = new ProcessError('Process failed', {
        exitCode: 1,
        signal: 'SIGTERM'
      });
      expect(error.details.exitCode).toBe(1);
      expect(error.details.signal).toBe('SIGTERM');
    });

    test('should be instanceof ClaudeCLIError', () => {
      const error = new ProcessError('Test');
      expect(error).toBeInstanceOf(ClaudeCLIError);
    });
  });

  describe('ValidationError', () => {
    test('should create validation error', () => {
      const error = new ValidationError('Invalid input');
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Invalid input');
    });

    test('should accept field errors', () => {
      const error = new ValidationError('Validation failed', {
        fields: ['email', 'password']
      });
      expect(error.details.fields).toEqual(['email', 'password']);
    });
  });

  describe('AuthenticationError', () => {
    test('should create authentication error', () => {
      const error = new AuthenticationError('Auth failed');
      expect(error.name).toBe('AuthenticationError');
      expect(error.message).toBe('Auth failed');
    });
  });

  describe('ParseError', () => {
    test('should create parse error', () => {
      const error = new ParseError('Parse failed');
      expect(error.name).toBe('ParseError');
      expect(error.message).toBe('Parse failed');
    });

    test('should accept raw output', () => {
      const raw = 'invalid json';
      const error = new ParseError('Parse failed', { rawOutput: raw });
      expect(error.details.rawOutput).toBe(raw);
    });
  });

  describe('AdapterError', () => {
    test('should create adapter error', () => {
      const error = new AdapterError('Adapter failed');
      expect(error.name).toBe('AdapterError');
      expect(error.message).toBe('Adapter failed');
    });

    test('should accept adapter type', () => {
      const error = new AdapterError('Adapter failed', {
        adapterType: 'cli'
      });
      expect(error.details.adapterType).toBe('cli');
    });
  });
});
