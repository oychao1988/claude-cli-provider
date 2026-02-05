#!/usr/bin/env node

/**
 * PTY Process Creation Test
 *
 * 测试 PTY 进程创建功能
 */

import { ProcessManager } from '../lib/claude/process-manager.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(color, symbol, message) {
  console.log(`${color}${symbol} ${message}${colors.reset}`);
}

async function testPTYCreation() {
  log(colors.blue, '📋', 'Testing PTY Process Creation...\n');

  const processManager = new ProcessManager({
    claudeBin: 'claude',
    maxProcesses: 2
  });

  try {
    log(colors.blue, '➤', 'Creating PTY process...');
    log(colors.yellow, '⏳', 'This may take up to 30 seconds...\n');

    const startTime = Date.now();

    // Create PTY process with a timeout
    const ptyPromise = processManager.createPTYProcess({
      model: 'haiku',
      allowedTools: ['Bash']
    });

    // Add a 30-second timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('PTY creation timeout after 30 seconds'));
      }, 30000);
    });

    const { ptyProcess, processId } = await Promise.race([ptyPromise, timeoutPromise]);

    const duration = Date.now() - startTime;

    log(colors.green, '✓', `PTY process created successfully!`);
    log(colors.green, '✓', `Process ID: ${processId}`);
    log(colors.green, '✓', `PID: ${ptyProcess.pid}`);
    log(colors.green, '✓', `Duration: ${duration}ms\n`);

    // Wait a bit to see if the process is stable
    log(colors.blue, '➤', 'Checking process stability...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const stats = processManager.getStats();
    log(colors.green, '✓', `Active PTY processes: ${stats.ptyProcesses}\n`);

    // Clean up
    log(colors.blue, '➤', 'Cleaning up...');
    const cleaned = processManager.cleanup(processId, 'pty');
    log(colors.green, '✓', `Process cleaned up: ${cleaned}\n`);

    log(colors.green, '✅', 'PTY creation test PASSED!');
    log(colors.blue, 'ℹ',  'Agent mode should work correctly.');

  } catch (error) {
    log(colors.red, '✗', `PTY creation FAILED: ${error.message}`);
    log(colors.yellow, '⚠',  '\nPossible issues:');
    log(colors.reset, ' ', '1. node-pty not properly compiled');
    log(colors.reset, ' ', '2. Claude CLI not responding');
    log(colors.reset, ' ', '3. System permissions issue');
    log(colors.reset, ' ', '4. PTY initialization timeout\n');

    log(colors.blue, 'ℹ',  'Try reinstalling node-pty:');
    log(colors.reset, ' ', 'npm install node-pty --build-from-source\n');

    process.exit(1);
  }
}

testPTYCreation();
