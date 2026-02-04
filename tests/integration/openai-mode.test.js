/**
 * OpenAI Mode Integration Tests
 *
 * End-to-end tests for OpenAI-compatible API endpoints.
 * Tests require the server to be running on localhost:3912
 *
 * @module tests/integration/openai-mode
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
const API_KEY = process.env.TEST_API_KEY || '';

// Helper function to make authenticated requests
const makeRequest = async (endpoint, data) => {
  const headers = {};
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }

  return axios.post(`${BASE_URL}${endpoint}`, data, { headers });
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

describe('OpenAI Mode Integration Tests', () => {
  let serverRunning = false;

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
  const testIfEnabled = serverRunning && testsEnabled ? test : test.skip;

  describe('Health Check', () => {
    testIfEnabled('should return health status', async () => {
      const response = await axios.get(`${BASE_URL}/health`);

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        status: 'ok',
        service: 'claude-cli-provider',
        claude_bin: expect.any(String)
      });
    });
  });

  describe('POST /v1/chat/completions - Basic Functionality', () => {
    testIfEnabled('should handle basic chat request (non-streaming)', async () => {
      const response = await makeRequest('/v1/chat/completions', {
        model: 'sonnet',
        messages: [
          { role: 'user', content: 'Say "Hello World"' }
        ],
        stream: false
      });

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        id: expect.any(String),
        object: 'chat.completion',
        created: expect.any(Number),
        model: expect.any(String),
        choices: expect.any(Array)
      });
      expect(response.data.choices.length).toBeGreaterThan(0);
      expect(response.data.choices[0].message).toMatchObject({
        role: 'assistant',
        content: expect.any(String)
      });
      expect(response.data.choices[0].message.content.toLowerCase()).toContain('hello');
    }, 30000);

    testIfEnabled('should handle empty messages array error', async () => {
      try {
        await makeRequest('/v1/chat/completions', {
          model: 'sonnet',
          messages: [],
          stream: false
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data).toMatchObject({
          error: {
            message: expect.stringContaining('Messages array'),
            type: 'invalid_request_error'
          }
        });
      }
    });

    testIfEnabled('should handle missing messages error', async () => {
      try {
        await makeRequest('/v1/chat/completions', {
          model: 'sonnet',
          stream: false
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data).toMatchObject({
          error: {
            message: expect.stringContaining('Messages array'),
            type: 'invalid_request_error'
          }
        });
      }
    });
  });

  describe('POST /v1/chat/completions - Streaming', () => {
    testIfEnabled('should handle streaming chat request', async () => {
      const response = await makeRequest('/v1/chat/completions', {
        model: 'sonnet',
        messages: [
          { role: 'user', content: 'Count from 1 to 3' }
        ],
        stream: true
      });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');

      // Collect all chunks
      const chunks = [];
      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data !== '[DONE]') {
              try {
                chunks.push(JSON.parse(data));
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

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toMatchObject({
        id: expect.any(String),
        object: 'chat.completion.chunk',
        created: expect.any(Number),
        model: expect.any(String),
        choices: expect.any(Array)
      });
    }, 30000);
  });

  describe('POST /v1/chat/completions - Multi-turn Conversation', () => {
    testIfEnabled('should maintain conversation context', async () => {
      const response = await makeRequest('/v1/chat/completions', {
        model: 'sonnet',
        messages: [
          { role: 'user', content: 'My name is Alice' },
          { role: 'assistant', content: 'Hello Alice! Nice to meet you.' },
          { role: 'user', content: 'What is my name?' }
        ],
        stream: false
      });

      expect(response.status).toBe(200);
      expect(response.data.choices[0].message.content).toMatch(/alice/i);
    }, 30000);
  });

  describe('POST /v1/chat/completions - Authentication', () => {
    testIfEnabled('should reject requests with invalid API key', async () => {
      if (!API_KEY) {
        // Skip if API_KEY not configured
        return;
      }

      try {
        await axios.post(`${BASE_URL}/v1/chat/completions`, {
          model: 'sonnet',
          messages: [{ role: 'user', content: 'Hi' }]
        }, {
          headers: {
            'Authorization': 'Bearer invalid-key'
          }
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(401);
        expect(error.response.data).toMatchObject({
          error: {
            message: 'Invalid API key',
            type: 'authentication_error'
          }
        });
      }
    });

    testIfEnabled('should accept requests with valid API key', async () => {
      if (!API_KEY) {
        // Skip if API_KEY not configured
        return;
      }

      const response = await axios.post(`${BASE_URL}/v1/chat/completions`, {
        model: 'sonnet',
        messages: [{ role: 'user', content: 'Hi' }]
      }, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`
        }
      });

      expect(response.status).toBe(200);
    }, 30000);
  });

  describe('Error Handling', () => {
    testIfEnabled('should handle 404 for unknown endpoints', async () => {
      try {
        await axios.post(`${BASE_URL}/v1/unknown`, {});
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(404);
        expect(error.response.data).toMatchObject({
          error: {
            message: 'Not found',
            type: 'not_found_error'
          }
        });
      }
    });

    testIfEnabled('should handle malformed JSON', async () => {
      try {
        await axios.post(`${BASE_URL}/v1/chat/completions`, 'invalid json', {
          headers: {
            'Content-Type': 'application/json'
          }
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBeGreaterThanOrEqual(400);
      }
    });
  });

  describe('Response Format', () => {
    testIfEnabled('should return OpenAI-compatible response format', async () => {
      const response = await makeRequest('/v1/chat/completions', {
        model: 'sonnet',
        messages: [
          { role: 'user', content: 'Say "Test"' }
        ],
        stream: false
      });

      expect(response.data).toMatchObject({
        id: expect.stringMatching(/^chatcmpl-/),
        object: 'chat.completion',
        created: expect.any(Number),
        model: expect.any(String),
        choices: expect.arrayContaining([
          expect.objectContaining({
            index: expect.any(Number),
            message: expect.objectContaining({
              role: 'assistant',
              content: expect.any(String)
            }),
            finish_reason: expect.any(String)
          })
        ]),
        usage: expect.objectContaining({
          prompt_tokens: expect.any(Number),
          completion_tokens: expect.any(Number),
          total_tokens: expect.any(Number)
        })
      });
    }, 30000);
  });
});
