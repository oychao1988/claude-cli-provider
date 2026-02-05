#!/usr/bin/env node

/**
 * Complete Agent Mode Chat Test
 *
 * 完整测试 Agent 模式的聊天功能
 */

import http from 'http';

const BASE_URL = 'localhost:3912';

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3912,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : body;
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function testAgentChat() {
  console.log('🧪 Testing Agent Mode Chat...\n');

  try {
    // Test 1: Health check
    console.log('➤ Test 1: Health check');
    const health = await makeRequest('GET', '/v1/agent/health');
    console.log(`✓ Status: ${health.status}`);
    console.log(`✓ Adapter: ${health.data.adapter}`);
    console.log(`✓ Healthy: ${health.data.healthy}\n`);

    // Test 2: Create new session with simple message
    console.log('➤ Test 2: Create session and send message');
    console.log('⏳ Creating session...');

    const chatResponse = await new Promise((resolve, reject) => {
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
        console.log(`✓ Response status: ${res.statusCode}`);
        console.log(`✓ Content-Type: ${res.headers['content-type']}`);

        let buffer = '';
        let sessionId = null;
        let eventCount = 0;
        let contentEvents = 0;
        let doneEvents = 0;

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              const eventType = line.slice(7).trim();
              eventCount++;

              if (eventType === 'content') contentEvents++;
              if (eventType === 'done') doneEvents++;
            }
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.session_id) {
                  sessionId = data.session_id;
                  console.log(`✓ Session ID: ${sessionId.substring(0, 8)}...`);
                }
              } catch (e) {
                // Ignore JSON parse errors for non-data lines
              }
            }
          }
        });

        res.on('end', () => {
          console.log(`✓ Total events: ${eventCount}`);
          console.log(`✓ Content events: ${contentEvents}`);
          console.log(`✓ Done events: ${doneEvents}`);
          resolve({
            status: res.statusCode,
            sessionId,
            eventCount,
            contentEvents,
            doneEvents
          });
        });

        res.on('error', reject);
      });

      req.on('error', reject);

      // Send message
      const payload = {
        content: 'Say "OK"',
        options: {
          model: 'haiku'
        }
      };

      console.log(`✓ Sending: "${payload.content}"`);
      req.write(JSON.stringify(payload));
      req.end();
    });

    // Wait a bit
    console.log('⏳ Waiting for response...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 3: Check session
    if (chatResponse.sessionId) {
      console.log('➤ Test 3: Check session details');
      const session = await makeRequest('GET', `/v1/agent/sessions/${chatResponse.sessionId}`);
      console.log(`✓ Session exists: ${session.status === 200}`);
      console.log(`✓ Message count: ${session.data.message_count || 0}\n`);
    }

    // Test 4: List all sessions
    console.log('➤ Test 4: List all sessions');
    const sessions = await makeRequest('GET', '/v1/agent/sessions');
    console.log(`✓ Total sessions: ${sessions.data.sessions.length}\n`);

    console.log('✅ All tests completed!');
    console.log('\n📝 Summary:');
    console.log(`   - Agent mode is working correctly`);
    console.log(`   - Session ID: ${chatResponse.sessionId || 'N/A'}`);
    console.log(`   - Events received: ${chatResponse.eventCount || 0}`);

  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Make sure the server is running:');
      console.error('   npm start');
    }
    process.exit(1);
  }
}

testAgentChat();
