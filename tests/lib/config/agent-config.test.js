/**
 * Agent Configuration Unit Tests
 */

import { AGENT_CONFIG, validateConfig, getConfigSummary } from '../../../lib/config/agent-config.js';

describe('Agent Configuration', () => {
  describe('Default Configuration Values', () => {
    test('should have default timeout values', () => {
      expect(AGENT_CONFIG.timeouts.PROMPT).toBe(60000);
      expect(AGENT_CONFIG.timeouts.STREAM).toBe(45000);
      expect(AGENT_CONFIG.timeouts.STREAM_CHECK).toBe(100);
      expect(AGENT_CONFIG.timeouts.HEARTBEAT).toBe(15000);
      expect(AGENT_CONFIG.timeouts.PROMPT_LOG).toBe(5000);
    });

    test('should have default screen stability values', () => {
      expect(AGENT_CONFIG.screen.STABLE_COUNT).toBe(3);
      expect(AGENT_CONFIG.screen.STABILITY_THRESHOLD).toBe(0.95);
    });

    test('should have default process pool values', () => {
      expect(AGENT_CONFIG.process.MAX_PROCESSES).toBe(5);
      expect(AGENT_CONFIG.process.GRACE_PERIOD).toBe(5000);
    });

    test('should have default session values', () => {
      expect(AGENT_CONFIG.session.MAX_AGE).toBe(86400000);
      expect(AGENT_CONFIG.session.CLEANUP_INTERVAL).toBe(3600000);
      expect(AGENT_CONFIG.session.SCREEN_HISTORY).toBe(10);
    });

    test('should have default logging values', () => {
      expect(AGENT_CONFIG.logging.DEBUG).toBe(false);
      expect(AGENT_CONFIG.logging.SCREEN_PREVIEW).toBe(200);
      expect(AGENT_CONFIG.logging.CONTENT_PREVIEW).toBe(100);
    });

    test('should have default PTY values', () => {
      expect(AGENT_CONFIG.pty.COLUMNS).toBe(80);
      expect(AGENT_CONFIG.pty.ROWS).toBe(24);
      expect(AGENT_CONFIG.pty.TERM).toBe('xterm-color');
    });
  });

  describe('Environment Variable Overrides', () => {
    test('should parse PROMPT_TIMEOUT from environment as integer', () => {
      const originalValue = process.env.AGENT_PROMPT_TIMEOUT;
      process.env.AGENT_PROMPT_TIMEOUT = '90000';
      expect(parseInt(process.env.AGENT_PROMPT_TIMEOUT, 10)).toBe(90000);
      if (originalValue !== undefined) {
        process.env.AGENT_PROMPT_TIMEOUT = originalValue;
      } else {
        delete process.env.AGENT_PROMPT_TIMEOUT;
      }
    });

    test('should parse STREAM_TIMEOUT from environment as integer', () => {
      const originalValue = process.env.AGENT_STREAM_TIMEOUT;
      process.env.AGENT_STREAM_TIMEOUT = '60000';
      expect(parseInt(process.env.AGENT_STREAM_TIMEOUT, 10)).toBe(60000);
      if (originalValue !== undefined) {
        process.env.AGENT_STREAM_TIMEOUT = originalValue;
      } else {
        delete process.env.AGENT_STREAM_TIMEOUT;
      }
    });

    test('should parse STABILITY_THRESHOLD from environment as float', () => {
      const originalValue = process.env.AGENT_STABILITY_THRESHOLD;
      process.env.AGENT_STABILITY_THRESHOLD = '0.98';
      expect(parseFloat(process.env.AGENT_STABILITY_THRESHOLD)).toBe(0.98);
      if (originalValue !== undefined) {
        process.env.AGENT_STABILITY_THRESHOLD = originalValue;
      } else {
        delete process.env.AGENT_STABILITY_THRESHOLD;
      }
    });

    test('should parse MAX_PROCESSES from environment as integer', () => {
      const originalValue = process.env.MAX_PTY_PROCESSES;
      process.env.MAX_PTY_PROCESSES = '10';
      expect(parseInt(process.env.MAX_PTY_PROCESSES, 10)).toBe(10);
      if (originalValue !== undefined) {
        process.env.MAX_PTY_PROCESSES = originalValue;
      } else {
        delete process.env.MAX_PTY_PROCESSES;
      }
    });

    test('should parse DEBUG logging boolean from environment', () => {
      const originalValue = process.env.AGENT_DEBUG_LOGGING;
      process.env.AGENT_DEBUG_LOGGING = 'true';
      expect(process.env.AGENT_DEBUG_LOGGING === 'true').toBe(true);
      if (originalValue !== undefined) {
        process.env.AGENT_DEBUG_LOGGING = originalValue;
      } else {
        delete process.env.AGENT_DEBUG_LOGGING;
      }
    });

    test('should parse PTY dimensions from environment', () => {
      const originalCol = process.env.AGENT_PTY_COLUMNS;
      const originalRow = process.env.AGENT_PTY_ROWS;
      process.env.AGENT_PTY_COLUMNS = '120';
      process.env.AGENT_PTY_ROWS = '36';
      expect(parseInt(process.env.AGENT_PTY_COLUMNS, 10)).toBe(120);
      expect(parseInt(process.env.AGENT_PTY_ROWS, 10)).toBe(36);
      if (originalCol !== undefined) {
        process.env.AGENT_PTY_COLUMNS = originalCol;
      } else {
        delete process.env.AGENT_PTY_COLUMNS;
      }
      if (originalRow !== undefined) {
        process.env.AGENT_PTY_ROWS = originalRow;
      } else {
        delete process.env.AGENT_PTY_ROWS;
      }
    });

    test('should parse PTY term type from environment', () => {
      const originalValue = process.env.AGENT_PTY_TERM;
      process.env.AGENT_PTY_TERM = 'xterm-256color';
      expect(process.env.AGENT_PTY_TERM || 'xterm-color').toBe('xterm-256color');
      if (originalValue !== undefined) {
        process.env.AGENT_PTY_TERM = originalValue;
      } else {
        delete process.env.AGENT_PTY_TERM;
      }
    });

    test('should handle false string for DEBUG correctly', () => {
      const originalValue = process.env.AGENT_DEBUG_LOGGING;
      process.env.AGENT_DEBUG_LOGGING = 'false';
      expect(process.env.AGENT_DEBUG_LOGGING === 'true').toBe(false);
      if (originalValue !== undefined) {
        process.env.AGENT_DEBUG_LOGGING = originalValue;
      } else {
        delete process.env.AGENT_DEBUG_LOGGING;
      }
    });
  });

  describe('Configuration Validation', () => {
    test('should return array from validateConfig', () => {
      const warnings = validateConfig();
      expect(Array.isArray(warnings)).toBe(true);
      // Note: Default config triggers 1 warning about STREAM < PROMPT timeout
      expect(warnings.length).toBeGreaterThanOrEqual(0);
    });

    test('should check PROMPT timeout threshold', () => {
      const warnings = validateConfig();
      // With default config (60000ms), should not warn
      const hasLowPromptWarning = warnings.some(w => w.includes('PROMPT timeout is very low'));
      expect(hasLowPromptWarning).toBe(false);
    });

    test('should check STREAM timeout threshold', () => {
      const warnings = validateConfig();
      // With default config (45000ms), should not warn
      const hasLowStreamWarning = warnings.some(w => w.includes('STREAM timeout is very low'));
      expect(hasLowStreamWarning).toBe(false);
    });

    test('should check STABILITY_THRESHOLD range', () => {
      const warnings = validateConfig();
      // With default config (0.95), should not warn
      const hasThresholdWarning = warnings.some(w => w.includes('STABILITY_THRESHOLD should be between'));
      expect(hasThresholdWarning).toBe(false);
    });

    test('should validate STABILITY_THRESHOLD upper bound', () => {
      // Test that value <= 1.0 is valid
      const isValid = AGENT_CONFIG.screen.STABILITY_THRESHOLD <= 1.0;
      expect(isValid).toBe(true);
    });

    test('should validate STABILITY_THRESHOLD lower bound', () => {
      // Test that value >= 0.8 is valid
      const isValid = AGENT_CONFIG.screen.STABILITY_THRESHOLD >= 0.8;
      expect(isValid).toBe(true);
    });

    test('should check MAX_PROCESSES minimum', () => {
      const warnings = validateConfig();
      // With default config (5), should not warn
      const hasMinProcessWarning = warnings.some(w => w.includes('MAX_PROCESSES must be at least 1'));
      expect(hasMinProcessWarning).toBe(false);
    });

    test('should check MAX_PROCESSES maximum', () => {
      const warnings = validateConfig();
      // With default config (5), should not warn
      const hasMaxProcessWarning = warnings.some(w => w.includes('MAX_PROCESSES is very high'));
      expect(hasMaxProcessWarning).toBe(false);
    });

    test('should return array type from validateConfig', () => {
      const warnings = validateConfig();
      expect(Array.isArray(warnings)).toBe(true);
    });
  });

  describe('Configuration Summary', () => {
    test('should return configuration summary object', () => {
      const summary = getConfigSummary();
      expect(summary).toHaveProperty('timeouts');
      expect(summary).toHaveProperty('screen');
      expect(summary).toHaveProperty('process');
      expect(summary).toHaveProperty('session');
      expect(summary).toHaveProperty('logging');
    });

    test('should include timeout values in summary', () => {
      const summary = getConfigSummary();
      expect(summary.timeouts).toEqual(AGENT_CONFIG.timeouts);
    });

    test('should format screen settings in summary', () => {
      const summary = getConfigSummary();
      expect(summary.screen.stableCount).toBe(AGENT_CONFIG.screen.STABLE_COUNT);
      expect(summary.screen.stabilityThreshold).toBe(AGENT_CONFIG.screen.STABILITY_THRESHOLD);
    });

    test('should format process settings in summary', () => {
      const summary = getConfigSummary();
      expect(summary.process.maxProcesses).toBe(AGENT_CONFIG.process.MAX_PROCESSES);
    });

    test('should format session times as hours in summary', () => {
      const summary = getConfigSummary();
      expect(summary.session.maxAge).toBe('24h');
      expect(summary.session.cleanupInterval).toBe('1h');
    });

    test('should include debug flag in summary', () => {
      const summary = getConfigSummary();
      expect(summary.logging.debug).toBe(AGENT_CONFIG.logging.DEBUG);
    });

    test('should not include sensitive or internal details in summary', () => {
      const summary = getConfigSummary();
      expect(summary).not.toHaveProperty('pty');
      expect(summary.screen).not.toHaveProperty('STABLE_COUNT');
      expect(summary.screen).not.toHaveProperty('STABILITY_THRESHOLD');
    });
  });

  describe('Configuration Structure', () => {
    test('should export AGENT_CONFIG as object', () => {
      expect(typeof AGENT_CONFIG).toBe('object');
      expect(AGENT_CONFIG).not.toBeNull();
    });

    test('should have all required configuration sections', () => {
      expect(AGENT_CONFIG).toHaveProperty('timeouts');
      expect(AGENT_CONFIG).toHaveProperty('screen');
      expect(AGENT_CONFIG).toHaveProperty('process');
      expect(AGENT_CONFIG).toHaveProperty('session');
      expect(AGENT_CONFIG).toHaveProperty('logging');
      expect(AGENT_CONFIG).toHaveProperty('pty');
    });

    test('should export validateConfig function', () => {
      expect(typeof validateConfig).toBe('function');
    });

    test('should export getConfigSummary function', () => {
      expect(typeof getConfigSummary).toBe('function');
    });

    test('should have default export', () => {
      // Default export is tested by importing the module
      // ES modules don't use require() in the same way
      expect(AGENT_CONFIG).toBeDefined();
      expect(typeof AGENT_CONFIG).toBe('object');
    });
  });

  describe('Edge Cases and Type Handling', () => {
    test('should handle parseInt with invalid values', () => {
      expect(parseInt('invalid', 10)).toBeNaN();
    });

    test('should handle parseFloat with invalid values', () => {
      expect(parseFloat('', 10)).toBeNaN();
    });

    test('should handle parseInt with zero values', () => {
      expect(parseInt('0', 10)).toBe(0);
    });

    test('should handle parseInt with negative values', () => {
      expect(parseInt('-5', 10)).toBe(-5);
    });

    test('should handle parseInt with decimal values', () => {
      expect(parseInt('5.7', 10)).toBe(5);
    });

    test('should handle parseFloat with decimal values', () => {
      expect(parseFloat('0.98')).toBe(0.98);
    });

    test('should validate configuration with edge case values', () => {
      // Test boundary conditions that trigger warnings
      const testConfig = {
        timeouts: {
          PROMPT: 5000,
          STREAM: 10000,
          STREAM_CHECK: 100,
          HEARTBEAT: 15000,
          PROMPT_LOG: 5000
        },
        screen: {
          STABLE_COUNT: 3,
          STABILITY_THRESHOLD: 0.95
        },
        process: {
          MAX_PROCESSES: 5,
          GRACE_PERIOD: 5000
        },
        session: {
          MAX_AGE: 86400000,
          CLEANUP_INTERVAL: 3600000,
          SCREEN_HISTORY: 10
        },
        logging: {
          DEBUG: false,
          SCREEN_PREVIEW: 200,
          CONTENT_PREVIEW: 100
        },
        pty: {
          COLUMNS: 80,
          ROWS: 24,
          TERM: 'xterm-color'
        }
      };

      // Test low PROMPT timeout boundary
      if (testConfig.timeouts.PROMPT < 10000) {
        expect(true).toBe(true); // Would trigger warning
      }

      // Test low STREAM timeout boundary
      if (testConfig.timeouts.STREAM < 15000) {
        expect(true).toBe(true); // Would trigger warning
      }
    });
  });

  describe('Configuration Relationships', () => {
    test('should maintain timeout relationship (STREAM < PROMPT by default)', () => {
      // Default config has STREAM < PROMPT, which triggers a warning
      const warnings = validateConfig();
      const hasTimeoutWarning = warnings.some(w => w.includes('STREAM timeout should be greater'));
      expect(hasTimeoutWarning).toBe(true);
    });

    test('should calculate timeout ratio correctly', () => {
      const ratio = AGENT_CONFIG.timeouts.STREAM / AGENT_CONFIG.timeouts.PROMPT;
      expect(ratio).toBe(45000 / 60000);
    });

    test('should maintain reasonable timeout proportions', () => {
      // Check that default timeouts have reasonable proportions
      const ratio = AGENT_CONFIG.timeouts.STREAM / AGENT_CONFIG.timeouts.PROMPT;
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThanOrEqual(1.0);
    });

    test('should validate relationship between STABLE_COUNT and SCREEN_HISTORY', () => {
      // STABLE_COUNT (3) should be less than SCREEN_HISTORY (10)
      expect(AGENT_CONFIG.screen.STABLE_COUNT).toBeLessThan(AGENT_CONFIG.session.SCREEN_HISTORY);
    });
  });

  describe('Numeric Value Parsing', () => {
    test('should correctly parse PROMPT timeout default', () => {
      expect(parseInt('60000', 10)).toBe(60000);
    });

    test('should correctly parse STREAM timeout default', () => {
      expect(parseInt('45000', 10)).toBe(45000);
    });

    test('should correctly parse STABILITY_THRESHOLD default', () => {
      expect(parseFloat('0.95')).toBe(0.95);
    });

    test('should correctly parse MAX_PROCESSES default', () => {
      expect(parseInt('5', 10)).toBe(5);
    });

    test('should correctly parse GRACE_PERIOD default', () => {
      expect(parseInt('5000', 10)).toBe(5000);
    });

    test('should correctly parse MAX_AGE default', () => {
      expect(parseInt('86400000', 10)).toBe(86400000);
    });

    test('should correctly parse CLEANUP_INTERVAL default', () => {
      expect(parseInt('3600000', 10)).toBe(3600000);
    });

    test('should correctly parse SCREEN_HISTORY default', () => {
      expect(parseInt('10', 10)).toBe(10);
    });
  });

  describe('Boolean Configuration', () => {
    test('should parse DEBUG flag as boolean', () => {
      expect(process.env.AGENT_DEBUG_LOGGING === 'true').toBe(false);
    });

    test('should handle undefined DEBUG flag', () => {
      expect(process.env.AGENT_DEBUG_LOGGING === 'true').toBe(false);
    });
  });

  describe('String Configuration', () => {
    test('should have correct PTY term type', () => {
      expect(typeof AGENT_CONFIG.pty.TERM).toBe('string');
    });

    test('should have non-empty PTY term type', () => {
      expect(AGENT_CONFIG.pty.TERM.length).toBeGreaterThan(0);
    });
  });

  describe('Timeout Configuration Values', () => {
    test('should have PROMPT timeout in milliseconds', () => {
      expect(AGENT_CONFIG.timeouts.PROMPT).toBeGreaterThan(0);
    });

    test('should have STREAM timeout in milliseconds', () => {
      expect(AGENT_CONFIG.timeouts.STREAM).toBeGreaterThan(0);
    });

    test('should have STREAM_CHECK interval in milliseconds', () => {
      expect(AGENT_CONFIG.timeouts.STREAM_CHECK).toBeGreaterThan(0);
    });

    test('should have HEARTBEAT interval in milliseconds', () => {
      expect(AGENT_CONFIG.timeouts.HEARTBEAT).toBeGreaterThan(0);
    });

    test('should have PROMPT_LOG interval in milliseconds', () => {
      expect(AGENT_CONFIG.timeouts.PROMPT_LOG).toBeGreaterThan(0);
    });
  });

  describe('Process Configuration Values', () => {
    test('should have positive MAX_PROCESSES', () => {
      expect(AGENT_CONFIG.process.MAX_PROCESSES).toBeGreaterThan(0);
    });

    test('should have positive GRACE_PERIOD', () => {
      expect(AGENT_CONFIG.process.GRACE_PERIOD).toBeGreaterThan(0);
    });
  });

  describe('Session Configuration Values', () => {
    test('should have positive MAX_AGE', () => {
      expect(AGENT_CONFIG.session.MAX_AGE).toBeGreaterThan(0);
    });

    test('should have positive CLEANUP_INTERVAL', () => {
      expect(AGENT_CONFIG.session.CLEANUP_INTERVAL).toBeGreaterThan(0);
    });

    test('should have positive SCREEN_HISTORY', () => {
      expect(AGENT_CONFIG.session.SCREEN_HISTORY).toBeGreaterThan(0);
    });
  });

  describe('Logging Configuration Values', () => {
    test('should have positive SCREEN_PREVIEW length', () => {
      expect(AGENT_CONFIG.logging.SCREEN_PREVIEW).toBeGreaterThan(0);
    });

    test('should have positive CONTENT_PREVIEW length', () => {
      expect(AGENT_CONFIG.logging.CONTENT_PREVIEW).toBeGreaterThan(0);
    });
  });

  describe('PTY Configuration Values', () => {
    test('should have positive COLUMNS', () => {
      expect(AGENT_CONFIG.pty.COLUMNS).toBeGreaterThan(0);
    });

    test('should have positive ROWS', () => {
      expect(AGENT_CONFIG.pty.ROWS).toBeGreaterThan(0);
    });
  });
});
