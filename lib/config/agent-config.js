/**
 * Agent Mode Configuration
 *
 * Centralized configuration for Agent mode timeouts, limits, and settings.
 * These values can be overridden via environment variables.
 *
 * @module lib/config/agent-config
 */

/**
 * Default configuration for Agent mode
 */
export const AGENT_CONFIG = {
  /**
   * Timeout settings (in milliseconds)
   */
  timeouts: {
    /**
     * Maximum time to wait for initial prompt from PTY
     * Default: 60000ms (60 seconds)
     * Env var: AGENT_PROMPT_TIMEOUT
     */
    PROMPT: parseInt(process.env.AGENT_PROMPT_TIMEOUT || '60000', 10),

    /**
     * Maximum duration for stream response
     * Default: 45000ms (45 seconds)
     * Env var: AGENT_STREAM_TIMEOUT
     */
    STREAM: parseInt(process.env.AGENT_STREAM_TIMEOUT || '45000', 10),

    /**
     * Interval to check for screen changes during streaming
     * Default: 100ms
     * Env var: AGENT_STREAM_CHECK_INTERVAL
     */
    STREAM_CHECK: parseInt(process.env.AGENT_STREAM_CHECK_INTERVAL || '100', 10),

    /**
     * How often to send heartbeat events in SSE stream
     * Default: 15000ms (15 seconds)
     * Env var: AGENT_HEARTBEAT_INTERVAL
     */
    HEARTBEAT: parseInt(process.env.AGENT_HEARTBEAT_INTERVAL || '15000', 10),

    /**
     * How often to log progress while waiting for prompt
     * Default: 5000ms (5 seconds)
     * Env var: AGENT_PROMPT_LOG_INTERVAL
     */
    PROMPT_LOG: parseInt(process.env.AGENT_PROMPT_LOG_INTERVAL || '5000', 10),
  },

  /**
   * Screen stability settings
   */
  screen: {
    /**
     * Number of consecutive stable snapshots required to consider screen stable
     * Default: 3
     * Env var: AGENT_STABLE_COUNT
     */
    STABLE_COUNT: parseInt(process.env.AGENT_STABLE_COUNT || '3', 10),

    /**
     * Similarity threshold for screen stability (0-1)
     * Default: 0.95 (95% similar)
     * Env var: AGENT_STABILITY_THRESHOLD
     */
    STABILITY_THRESHOLD: parseFloat(process.env.AGENT_STABILITY_THRESHOLD || '0.95'),
  },

  /**
   * Process pool settings
   */
  process: {
    /**
     * Maximum number of concurrent PTY processes
     * Default: 5
     * Env var: MAX_PTY_PROCESSES
     */
    MAX_PROCESSES: parseInt(process.env.MAX_PTY_PROCESSES || '5', 10),

    /**
     * Grace period before forcefully killing a process (ms)
     * Default: 5000ms (5 seconds)
     * Env var: AGENT_PROCESS_GRACE_PERIOD
     */
    GRACE_PERIOD: parseInt(process.env.AGENT_PROCESS_GRACE_PERIOD || '5000', 10),
  },

  /**
   * Session settings
   */
  session: {
    /**
     * Maximum age of a session before cleanup (ms)
     * Default: 86400000ms (24 hours)
     * Env var: AGENT_SESSION_MAX_AGE
     */
    MAX_AGE: parseInt(process.env.AGENT_SESSION_MAX_AGE || '86400000', 10),

    /**
     * Interval between session cleanup cycles (ms)
     * Default: 3600000ms (1 hour)
     * Env var: AGENT_SESSION_CLEANUP_INTERVAL
     */
    CLEANUP_INTERVAL: parseInt(process.env.AGENT_SESSION_CLEANUP_INTERVAL || '3600000', 10),

    /**
     * Maximum number of screen snapshots to keep per session
     * Default: 10
     * Env var: AGENT_SCREEN_HISTORY_SIZE
     */
    SCREEN_HISTORY: parseInt(process.env.AGENT_SCREEN_HISTORY_SIZE || '10', 10),
  },

  /**
   * Logging settings
   */
  logging: {
    /**
     * Enable detailed debug logging
     * Default: false
     * Env var: AGENT_DEBUG_LOGGING
     */
    DEBUG: process.env.AGENT_DEBUG_LOGGING === 'true',

    /**
     * Log screen buffer length in error messages
     * Default: 200 characters
     * Env var: AGENT_SCREEN_PREVIEW_LENGTH
     */
    SCREEN_PREVIEW: parseInt(process.env.AGENT_SCREEN_PREVIEW_LENGTH || '200', 10),

    /**
     * Maximum content preview length in logs
     * Default: 100 characters
     * Env var: AGENT_CONTENT_PREVIEW_LENGTH
     */
    CONTENT_PREVIEW: parseInt(process.env.AGENT_CONTENT_PREVIEW_LENGTH || '100', 10),
  },

  /**
   * PTY settings
   */
  pty: {
    /**
     * Default terminal columns
     * Default: 80
     * Env var: AGENT_PTY_COLUMNS
     */
    COLUMNS: parseInt(process.env.AGENT_PTY_COLUMNS || '80', 10),

    /**
     * Default terminal rows
     * Default: 24
     * Env var: AGENT_PTY_ROWS
     */
    ROWS: parseInt(process.env.AGENT_PTY_ROWS || '24', 10),

    /**
     * Terminal type
     * Default: 'xterm-color'
     * Env var: AGENT_PTY_TERM
     */
    TERM: process.env.AGENT_PTY_TERM || 'xterm-color',
  }
};

/**
 * Validate configuration and log warnings for potential issues
 */
export function validateConfig() {
  const warnings = [];

  // Check timeout values are reasonable
  if (AGENT_CONFIG.timeouts.PROMPT < 10000) {
    warnings.push('PROMPT timeout is very low (< 10s), may cause initialization failures');
  }

  if (AGENT_CONFIG.timeouts.STREAM < 15000) {
    warnings.push('STREAM timeout is very low (< 15s), may cause response cutoffs');
  }

  if (AGENT_CONFIG.timeouts.STREAM < AGENT_CONFIG.timeouts.PROMPT) {
    warnings.push('STREAM timeout should be greater than PROMPT timeout');
  }

  // Check stability threshold
  if (AGENT_CONFIG.screen.STABILITY_THRESHOLD < 0.8 || AGENT_CONFIG.screen.STABILITY_THRESHOLD > 1.0) {
    warnings.push('STABILITY_THRESHOLD should be between 0.8 and 1.0');
  }

  // Check process pool size
  if (AGENT_CONFIG.process.MAX_PROCESSES < 1) {
    warnings.push('MAX_PROCESSES must be at least 1');
  }

  if (AGENT_CONFIG.process.MAX_PROCESSES > 20) {
    warnings.push('MAX_PROCESSES is very high (> 20), may cause resource issues');
  }

  return warnings;
}

/**
 * Get configuration summary for logging
 */
export function getConfigSummary() {
  return {
    timeouts: AGENT_CONFIG.timeouts,
    screen: {
      stableCount: AGENT_CONFIG.screen.STABLE_COUNT,
      stabilityThreshold: AGENT_CONFIG.screen.STABILITY_THRESHOLD
    },
    process: {
      maxProcesses: AGENT_CONFIG.process.MAX_PROCESSES
    },
    session: {
      maxAge: `${AGENT_CONFIG.session.MAX_AGE / 3600000}h`,
      cleanupInterval: `${AGENT_CONFIG.session.CLEANUP_INTERVAL / 3600000}h`
    },
    logging: {
      debug: AGENT_CONFIG.logging.DEBUG
    }
  };
}

export default AGENT_CONFIG;
