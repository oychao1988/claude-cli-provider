#!/usr/bin/env node

/**
 * Agent Mode Verification Script
 *
 * 快速验证 Agent 模式的核心功能是否正常
 */

import { logger } from '../lib/utils/index.js';
import { SessionManager } from '../lib/claude/session-manager.js';
import { ScreenParser } from '../lib/claude/screen-parser.js';
import { ProcessManager } from '../lib/claude/process-manager.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, symbol, message) {
  console.log(`${color}${symbol} ${message}${colors.reset}`);
}

async function verifyComponents() {
  log(colors.cyan, '📋', 'Agent Mode 组件验证\n');

  let allPassed = true;

  // Test 1: SessionManager
  try {
    log(colors.blue, '➤', 'Test 1: SessionManager 初始化...');
    const sessionManager = new SessionManager();
    const session = sessionManager.createSession({
      model: 'sonnet',
      allowedTools: ['Bash', 'Read']
    });

    if (!session.sessionId) {
      throw new Error('Failed to create session');
    }

    sessionManager.updateStatus(session.sessionId, 'ready');
    sessionManager.addMessage(session.sessionId, {
      role: 'user',
      content: 'Test message'
    });

    const sessions = sessionManager.listSessions();
    if (sessions.length !== 1) {
      throw new Error(`Expected 1 session, got ${sessions.length}`);
    }

    const details = sessionManager.getSessionDetails(session.sessionId);
    if (details.message_count !== 1) {
      throw new Error(`Expected 1 message, got ${details.message_count}`);
    }

    sessionManager.deleteSession(session.sessionId);
    log(colors.green, '✓', 'SessionManager: 所有测试通过\n');
  } catch (error) {
    log(colors.red, '✗', `SessionManager: ${error.message}\n`);
    allPassed = false;
  }

  // Test 2: ScreenParser
  try {
    log(colors.blue, '➤', 'Test 2: ScreenParser 功能测试...');

    const screen1 = 'Line 1\nLine 2\nLine 3';
    const screen2 = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';

    const diff = ScreenParser.diff(screen1, screen2);
    if (!diff.includes('Line 4') || !diff.includes('Line 5')) {
      throw new Error('Diff calculation failed');
    }

    const cleaned = ScreenParser.stripUIElements('> Hello\n───\nResponse', 'Hello');
    if (cleaned.includes('Hello') || cleaned.includes('─')) {
      throw new Error('Strip UI elements failed');
    }

    const stable = ScreenParser.isScreenStable(screen1, screen1);
    if (!stable) {
      throw new Error('Stability check failed');
    }

    const analysis = ScreenParser.analyzeScreen('> Test\nContent here', 'Test');
    if (analysis.hasPrompt !== true) {
      throw new Error('Prompt detection failed');
    }

    log(colors.green, '✓', 'ScreenParser: 所有测试通过\n');
  } catch (error) {
    log(colors.red, '✗', `ScreenParser: ${error.message}\n`);
    allPassed = false;
  }

  // Test 3: ProcessManager (without actually creating PTY)
  try {
    log(colors.blue, '➤', 'Test 3: ProcessManager 初始化...');
    const processManager = new ProcessManager({
      claudeBin: 'claude',
      maxProcesses: 5
    });

    const stats = processManager.getStats();
    if (stats.limit !== 5) {
      throw new Error(`Expected limit 5, got ${stats.limit}`);
    }
    if (stats.total !== 0) {
      throw new Error(`Expected 0 processes, got ${stats.total}`);
    }

    const health = processManager.healthCheck();
    if (!health.healthy) {
      throw new Error('Health check failed');
    }

    log(colors.green, '✓', 'ProcessManager: 初始化正常\n');
  } catch (error) {
    log(colors.red, '✗', `ProcessManager: ${error.message}\n`);
    allPassed = false;
  }

  // Test 4: Code consistency checks
  try {
    log(colors.blue, '➤', 'Test 4: 代码一致性检查...');

    // Check if PTYAdapter can be imported
    const { PTYAdapter } = await import('../lib/adapters/pty-adapter.js');
    const adapter = new PTYAdapter({ claudeBin: 'claude' });

    const health = adapter.healthCheck();
    if (health.adapter !== 'pty') {
      throw new Error('Adapter type mismatch');
    }

    log(colors.green, '✓', '代码导入和初始化正常\n');
  } catch (error) {
    log(colors.red, '✗', `代码一致性: ${error.message}\n`);
    allPassed = false;
  }

  // Summary
  console.log('─'.repeat(50));
  if (allPassed) {
    log(colors.green, '✅', '所有组件验证通过！');
    log(colors.green, '✓', 'Agent 模式核心功能正常');
    console.log('');

    log(colors.blue, 'ℹ',  '下一步建议:');
    log(colors.reset, ' ',  '1. 启动服务器: npm start');
    log(colors.reset, ' ',  '2. 运行集成测试: npm test -- tests/integration/agent-mode.test.js');
    log(colors.reset, ' ',  '3. 手动测试: node scripts/test-agent-mode.mjs');
    console.log('');

    process.exit(0);
  } else {
    log(colors.red, '❌', '部分组件验证失败');
    log(colors.yellow, '⚠',  '请检查上述错误信息');
    process.exit(1);
  }
}

verifyComponents().catch(error => {
  log(colors.red, '💥', `验证脚本错误: ${error.message}`);
  console.error(error);
  process.exit(1);
});
