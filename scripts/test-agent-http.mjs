#!/usr/bin/env node

/**
 * Agent Mode HTTP Test with Improved Error Handling
 *
 * 改进的 Agent 模式 HTTP 测试
 */

import http from 'http';

function makeAgentRequest(content, model = 'haiku') {
  return new Promise((resolve, reject) => {
    const timeout = 60000; // 60 seconds timeout
    const timeoutId = setTimeout(() => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    const options = {
      hostname: 'localhost',
      port: 3912,
      path: '/v1/agent/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      clearTimeout(timeoutId);

      const events = [];
      let buffer = '';
      let sessionId = null;

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const eventType = line.slice(7).trim();
            events.push({ type: 'event', value: eventType });
          }
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              events.push({ type: 'data', value: data });

              if (data.session_id) {
                sessionId = data.session_id;
              }
            } catch (e) {
              // Ignore JSON parse errors
            }
          }
        }
      });

      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          sessionId,
          events
        });
      });

      res.on('error', (error) => {
        reject(error);
      });
    });

    req.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    req.on('timeout', () => {
      clearTimeout(timeoutId);
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.setTimeout(timeout);

    req.write(JSON.stringify({
      content,
      options: { model }
    }));

    req.end();
  });
}

async function testAgentHTTP() {
  console.log('🧪 Agent Mode HTTP Test\n');
  console.log('⏳ This test may take up to 60 seconds...\n');

  try {
    console.log('➤ Sending request to Agent API...');
    console.log('   Content: "Say OK"');
    console.log('   Model: haiku\n');

    const startTime = Date.now();
    const response = await makeAgentRequest('Say OK', 'haiku');
    const duration = Date.now() - startTime;

    console.log(`✓ Response status: ${response.status}`);
    console.log(`✓ Content-Type: ${response.headers['content-type']}`);
    console.log(`✓ Duration: ${duration}ms\n`);

    if (response.sessionId) {
      console.log(`✓ Session ID: ${response.sessionId.substring(0, 8)}...`);
    }

    console.log(`✓ Total events received: ${response.events.length}`);

    const eventTypes = {};
    response.events.forEach(e => {
      if (e.type === 'event') {
        eventTypes[e.value] = (eventTypes[e.value] || 0) + 1;
      }
    });

    console.log('\n📊 Event breakdown:');
    Object.entries(eventTypes).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });

    const contentEvents = eventTypes['content'] || 0;
    const doneEvents = eventTypes['done'] || 0;
    const errorEvents = eventTypes['error'] || 0;

    console.log('\n✅ Test Results:');
    console.log(`   ✓ Session created: ${response.sessionId ? 'Yes' : 'No'}`);
    console.log(`   ✓ Content events: ${contentEvents}`);
    console.log(`   ✓ Done events: ${doneEvents}`);
    console.log(`   ✓ Error events: ${errorEvents}`);

    if (doneEvents > 0) {
      console.log('\n✅ Agent mode is working correctly!');
      console.log('   The response was completed successfully.');
    } else if (errorEvents > 0) {
      console.log('\n⚠️  Some errors occurred during response.');
      console.log('   Check server logs for details.');
    } else {
      console.log('\n⚠️  No "done" event received.');
      console.log('   The response may still be processing.');
    }

  } catch (error) {
    console.error('\n✗ Test failed:', error.message);

    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Server is not running.');
      console.error('   Start it with: npm start');
    } else if (error.message.includes('timeout')) {
      console.error('\n💡 Request timed out.');
      console.error('   This may indicate PTY initialization issues.');
    } else if (error.message.includes('hang up')) {
      console.error('\n💡 Connection was closed prematurely.');
      console.error('   This may be a server-side error.');
    }

    console.error('\n📋 Error details:');
    console.error(`   Code: ${error.code || 'N/A'}`);
    console.error(`   Message: ${error.message}`);

    process.exit(1);
  }
}

testAgentHTTP();
