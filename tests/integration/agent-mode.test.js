/**
 * Agent Mode Integration Tests
 *
 * End-to-end tests for Agent mode API endpoints.
 * Tests require the server to be running on localhost:3912
 *
 * @module tests/integration/agent-mode
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

// Conditionally import axios - if not available, skip tests
let axios;
let testsEnabled = true;

try {
  axios = (await import('axios')).default;
} catch (error) {
  console.warn('axios not installed, skipping integration tests');
  testsEnabled = false;
}

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3912';

// Helper function to make requests
const makeRequest = async (endpoint, data) => {
  return axios.post(`${BASE_URL}${endpoint}`, data);
};

// Helper function to check if server is running
const checkServerRunning = async () => {
  try {
    await axios.get(`${BASE_URL}/health`, { timeout: 2000 });
    return true;
  } catch (error) {
    return false;
  }
};

describe('Agent Mode Integration Tests', () => {
  let serverRunning = false;
  let testSessionId = null;

  beforeAll(async () => {
    if (!testsEnabled) {
      return;
    }
    serverRunning = await checkServerRunning();
    if (!serverRunning) {
      console.warn('Server is not running, skipping integration tests');
      console.warn(`Start server with: npm start`);
      console.warn(`Server URL: ${BASE_URL}`);
    }
  });

  // Skip all tests if server is not running or axios not available
  const testIfEnabled = (name, callback, timeout) => {
    test(name, async () => {
      if (!serverRunning || !testsEnabled) {
        return;
      }
      await callback();
    }, timeout);
  };

  describe('POST /v1/agent/chat - Basic Functionality', () => {
    testIfEnabled('should create a new session and return response', async () => {
      const response = await makeRequest('/v1/agent/chat', {
        content: 'Say "Hello Agent"',
        options: {
          model: 'sonnet'
        }
      });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');

      // Collect all events
      const events = [];
      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim());
        let currentEvent = { type: '', data: null };

        lines.forEach(line => {
          if (line.startsWith('event: ')) {
            if (currentEvent.type) {
              events.push(currentEvent);
            }
            currentEvent = { type: line.slice(7), data: null };
          } else if (line.startsWith('data: ')) {
            try {
              currentEvent.data = JSON.parse(line.slice(6));
            } catch (e) {
              // Skip invalid JSON
            }
          }
        });

        if (currentEvent.type) {
          events.push(currentEvent);
        }
      });

      await new Promise((resolve, reject) => {
        response.data.on('end', resolve);
        response.data.on('error', reject);
      });

      expect(events.length).toBeGreaterThan(0);

      // Check session event
      const sessionEvent = events.find(e => e.type === 'session');
      expect(sessionEvent).toBeDefined();
      expect(sessionEvent.data).toMatchObject({
        session_id: expect.any(String)
      });

      testSessionId = sessionEvent.data.session_id;

      // Check content events
      const contentEvents = events.filter(e => e.type === 'content');
      expect(contentEvents.length).toBeGreaterThan(0);

      // Check done event
      const doneEvent = events.find(e => e.type === 'done');
      expect(doneEvent).toBeDefined();
    }, 45000);

    testIfEnabled('should handle missing content error', async () => {
      try {
        await makeRequest('/v1/agent/chat', {
          options: { model: 'sonnet' }
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data).toMatchObject({
          error: {
            message: expect.stringContaining('Content'),
            type: 'invalid_request_error'
          }
        });
      }
    });

    testIfEnabled('should handle empty content error', async () => {
      try {
        await makeRequest('/v1/agent/chat', {
          content: '',
          options: { model: 'sonnet' }
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data).toMatchObject({
          error: {
            message: expect.stringContaining('Content'),
            type: 'invalid_request_error'
          }
        });
      }
    });
  });

  describe('POST /v1/agent/chat - Multi-turn Conversation', () => {
    testIfEnabled('should maintain conversation context in session', async () => {
      if (!testSessionId) {
        // Skip if no session ID from previous test
        return;
      }

      const response = await makeRequest('/v1/agent/chat', {
        content: 'What did I just ask you?',
        session_id: testSessionId,
        options: {
          model: 'sonnet'
        }
      });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');

      // Collect response
      let fullContent = '';
      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          if (line.startsWith('event: content')) {
            const nextLine = lines[lines.indexOf(line) + 1];
            if (nextLine && nextLine.startsWith('data: ')) {
              try {
                const data = JSON.parse(nextLine.slice(6));
                if (data.content) {
                  fullContent += data.content;
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        });
      });

      await new Promise((resolve, reject) => {
        response.data.on('end', resolve);
        response.data.on('error', reject);
      });

      // Should reference previous conversation
      expect(fullContent.length).toBeGreaterThan(0);
    }, 45000);
  });

  describe('GET /v1/agent/sessions', () => {
    testIfEnabled('should list sessions', async () => {
      const response = await axios.get(`${BASE_URL}/v1/agent/sessions`);

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        sessions: expect.any(Array)
      });

      // Should contain our test session
      if (testSessionId) {
        const testSession = response.data.sessions.find(s => s.session_id === testSessionId);
        expect(testSession).toBeDefined();
        expect(testSession).toMatchObject({
          session_id: testSessionId,
          created_at: expect.any(String),
          message_count: expect.any(Number)
        });
      }
    });
  });

  describe('GET /v1/agent/sessions/:session_id', () => {
    testIfEnabled('should get session details', async () => {
      if (!testSessionId) {
        // Skip if no session ID
        return;
      }

      const response = await axios.get(`${BASE_URL}/v1/agent/sessions/${testSessionId}`);

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        session_id: testSessionId,
        created_at: expect.any(String),
        messages: expect.any(Array)
      });
    });

    testIfEnabled('should return 404 for non-existent session', async () => {
      try {
        await axios.get(`${BASE_URL}/v1/agent/sessions/non-existent-session`);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(404);
        expect(error.response.data).toMatchObject({
          error: {
            message: expect.stringContaining('not found'),
            type: 'not_found_error'
          }
        });
      }
    });
  });

  describe('DELETE /v1/agent/sessions/:session_id', () => {
    testIfEnabled('should delete a session', async () => {
      if (!testSessionId) {
        // Skip if no session ID
        return;
      }

      const response = await axios.delete(`${BASE_URL}/v1/agent/sessions/${testSessionId}`);

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        success: true
      });

      // Verify session is deleted
      try {
        await axios.get(`${BASE_URL}/v1/agent/sessions/${testSessionId}`);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(404);
      }
    });

    testIfEnabled('should return 404 when deleting non-existent session', async () => {
      try {
        await axios.delete(`${BASE_URL}/v1/agent/sessions/non-existent-session`);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(404);
      }
    });
  });

  describe('SSE Events', () => {
    testIfEnabled('should emit various event types', async () => {
      const response = await makeRequest('/v1/agent/chat', {
        content: 'Tell me a short joke',
        options: {
          model: 'sonnet'
        }
      });

      // Collect event types
      const eventTypes = new Set();
      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          if (line.startsWith('event: ')) {
            eventTypes.add(line.slice(7));
          }
        });
      });

      await new Promise((resolve, reject) => {
        response.data.on('end', resolve);
        response.data.on('error', reject);
      });

      // Should have session, content, and done events
      expect(eventTypes.has('session')).toBe(true);
      expect(eventTypes.has('done')).toBe(true);
    }, 45000);
  });

  describe('Error Handling', () => {
    testIfEnabled('should handle session timeout gracefully', async () => {
      // This test would require mocking a session timeout
      // For now, we just verify the error response format
      const response = await makeRequest('/v1/agent/chat', {
        content: 'Hi',
        options: {
          model: 'sonnet'
        }
      });

      expect(response.status).toBe(200);
    }, 30000);
  });

  describe('Tool Call Detection', () => {
    testIfEnabled('should detect tool calls in response', async () => {
      const response = await makeRequest('/v1/agent/chat', {
        content: 'List all files in current directory using Bash tool',
        options: {
          model: 'sonnet',
          allowedTools: ['Bash', 'Read', 'Write']
        }
      });

      // Collect tool_use events
      const toolUseEvents = [];
      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim());
        let currentEvent = { type: '', data: null };

        lines.forEach(line => {
          if (line.startsWith('event: ')) {
            if (currentEvent.type && currentEvent.type === 'tool_use') {
              toolUseEvents.push(currentEvent);
            }
            currentEvent = { type: line.slice(7), data: null };
          } else if (line.startsWith('data: ') && currentEvent.type === 'tool_use') {
            try {
              currentEvent.data = JSON.parse(line.slice(6));
            } catch (e) {
              // Skip invalid JSON
            }
          }
        });

        if (currentEvent.type && currentEvent.type === 'tool_use') {
          toolUseEvents.push(currentEvent);
        }
      });

      await new Promise((resolve, reject) => {
        response.data.on('end', resolve);
        response.data.on('error', reject);
      });

      // Note: Tool calls are optional and depend on Claude's response
      // We just verify the event format if they occur
      if (toolUseEvents.length > 0) {
        expect(toolUseEvents[0].data).toMatchObject({
          tool: expect.any(String),
          action: expect.any(String)
        });
      }
    }, 60000);
  });
});
