#!/usr/bin/env node

/**
 * Agent Mode Manual Test
 *
 * This script manually tests Agent mode functionality
 * to ensure everything works correctly.
 */

import { PTYAdapter } from '../lib/adapters/pty-adapter.js';
import { logger } from '../lib/utils/index.js';

const TEST_CONFIG = {
  claudeBin: process.env.CLAUDE_BIN || 'claude',
  maxProcesses: 2
};

// ANSI color codes for output
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

async function testAgentMode() {
  log(colors.cyan, '📋', 'Starting Agent Mode Tests...\n');

  const adapter = new PTYAdapter(TEST_CONFIG);

  try {
    // Test 1: Create session
    log(colors.blue, '➤', 'Test 1: Creating new session...');
    const session1 = await adapter.getOrCreateSession(null, {
      model: 'haiku',
      allowedTools: ['Bash']
    });
    log(colors.green, '✓', `Session created: ${session1.sessionId}`);
    log(colors.green, '✓', `Process ID: ${session1.processId}\n`);

    // Test 2: Send simple message
    log(colors.blue, '➤', 'Test 2: Sending simple message...');
    await adapter.sendMessage(session1.sessionId, 'Say "OK"');
    log(colors.green, '✓', 'Message sent\n');

    // Test 3: Stream response
    log(colors.blue, '➤', 'Test 3: Streaming response...');
    const events = [];
    for await (const event of adapter.streamResponse(session1.sessionId)) {
      events.push(event);
      if (event.type === 'content') {
        process.stdout.write('.');
      }
    }
    console.log('');
    log(colors.green, `✓`, `Received ${events.length} events`);

    const contentEvents = events.filter(e => e.type === 'content');
    const toolEvents = events.filter(e => e.type === 'tool_call');
    const doneEvents = events.filter(e => e.type === 'done');

    log(colors.green, '✓', `Content events: ${contentEvents.length}`);
    log(colors.green, '✓', `Tool events: ${toolEvents.length}`);
    log(colors.green, '✓', `Done events: ${doneEvents.length}\n`);

    // Test 4: Multi-turn conversation
    log(colors.blue, '➤', 'Test 4: Testing multi-turn conversation...');
    await adapter.sendMessage(session1.sessionId, 'What did I just ask you?');
    log(colors.green, '✓', 'Follow-up message sent\n');

    // Test 5: List sessions
    log(colors.blue, '➤', 'Test 5: Listing sessions...');
    const sessions = adapter.listSessions();
    log(colors.green, `✓`, `Active sessions: ${sessions.length}`);
    sessions.forEach(s => {
      log(colors.green, '  ', `- ${s.session_id.substring(0, 8)}... (${s.status})`);
    });
    console.log('');

    // Test 6: Get session details
    log(colors.blue, '➤', 'Test 6: Getting session details...');
    const details = adapter.getSession(session1.sessionId);
    log(colors.green, '✓', `Session: ${details.session_id}`);
    log(colors.green, '✓', `Messages: ${details.message_count}`);
    log(colors.green, '✓', `Status: ${details.status}\n`);

    // Test 7: Health check
    log(colors.blue, '➤', 'Test 7: Health check...');
    const health = adapter.healthCheck();
    log(colors.green, '✓', `Adapter: ${health.adapter}`);
    log(colors.green, '✓', `Healthy: ${health.healthy}`);
    log(colors.green, '✓', `Processes: ${health.processes.total}/${health.processes.limit}\n`);

    // Test 8: Create second session
    log(colors.blue, '➤', 'Test 8: Creating second session...');
    const session2 = await adapter.getOrCreateSession(null, {
      model: 'haiku'
    });
    log(colors.green, '✓', `Second session created: ${session2.sessionId}\n`);

    // Test 9: Cleanup
    log(colors.blue, '➤', 'Test 9: Cleaning up sessions...');
    const deleted1 = adapter.deleteSession(session1.sessionId);
    const deleted2 = adapter.deleteSession(session2.sessionId);
    log(colors.green, `✓`, `Deleted session 1: ${deleted1}`);
    log(colors.green, `✓`, `Deleted session 2: ${deleted2}\n`);

    // Final cleanup
    log(colors.blue, '➤', 'Test 10: Full cleanup...');
    await adapter.cleanup();
    log(colors.green, '✓', 'All resources cleaned up\n');

    log(colors.green, '✅', 'All tests passed!');
    process.exit(0);

  } catch (error) {
    log(colors.red, '✗', `Test failed: ${error.message}`);
    console.error(error);

    // Try to cleanup on error
    try {
      await adapter.cleanup();
    } catch (cleanupError) {
      log(colors.yellow, '⚠', `Cleanup error: ${cleanupError.message}`);
    }

    process.exit(1);
  }
}

// Run tests
testAgentMode();
