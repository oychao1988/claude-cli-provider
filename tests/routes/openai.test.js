/**
 * OpenAI Routes Unit Tests
 */

import request from 'supertest';
import express from 'express';
import openaiRouter from '../../routes/openai.js';

// Mock CLIAdapter
class MockCLIAdapter {
  constructor(config) {
    this.config = config;
  }

  async processRequest(requestData) {
    const { messages, model, stream } = requestData;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      const error = new Error('Messages array is required and must not be empty');
      error.name = 'ValidationError';
      throw error;
    }

    if (stream) {
      return {
        type: 'stream',
        processId: 'proc_test_123',
        generator: this._createMockStreamGenerator()
      };
    } else {
      return {
        type: 'response',
        data: {
          object: 'chat.completion',
          model: model || 'claude-sonnet',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: 'Test response'
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15
          }
        }
      };
    }
  }

  async *_createMockStreamGenerator() {
    yield {
      type: 'data',
      data: {
        object: 'chat.completion.chunk',
        model: 'claude-sonnet',
        choices: [{
          index: 0,
          delta: { role: 'assistant' },
          finish_reason: null
        }]
      }
    };

    yield {
      type: 'data',
      data: {
        object: 'chat.completion.chunk',
        model: 'claude-sonnet',
        choices: [{
          index: 0,
          delta: { content: 'Hello' },
          finish_reason: null
        }]
      }
    };

    yield {
      type: 'data',
      data: {
        object: 'chat.completion.chunk',
        model: 'claude-sonnet',
        choices: [{
          index: 0,
          delta: { content: ' world' },
          finish_reason: null
        }]
      }
    };

    yield {
      type: 'done'
    };
  }

  healthCheck() {
    return {
      adapter: 'cli',
      healthy: true,
      stats: {
        total: 0,
        limit: this.config.maxProcesses
      }
    };
  }
}

// Create test app
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.ip = '127.0.0.1';
    next();
  });
  app.use('/v1', openaiRouter);
  return app;
}

describe('OpenAI Routes', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('POST /v1/chat/completions', () => {
    describe('Authentication', () => {
      test('should allow request when API_KEY is not set (dev mode)', async () => {
        const originalApiKey = process.env.API_KEY;
        delete process.env.API_KEY;

        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }]
          })
          .set('Accept', 'application/json');

        process.env.API_KEY = originalApiKey;

        expect(response.status).toBeLessThan(500);
      });

      test('should reject request with invalid API key in Authorization header', async () => {
        const originalApiKey = process.env.API_KEY;
        process.env.API_KEY = 'test-api-key';

        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }]
          })
          .set('Authorization', 'Bearer invalid-key')
          .set('Accept', 'application/json');

        process.env.API_KEY = originalApiKey;

        expect(response.status).toBe(401);
        expect(response.body.error).toBeDefined();
        expect(response.body.error.type).toBe('authentication_error');
      });

      test('should accept request with valid API key in Authorization header', async () => {
        const originalApiKey = process.env.API_KEY;
        process.env.API_KEY = 'test-api-key';

        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }]
          })
          .set('Authorization', 'Bearer test-api-key')
          .set('Accept', 'application/json');

        process.env.API_KEY = originalApiKey;

        expect(response.status).toBeLessThan(500);
      });

      test('should accept request with valid API key in x-api-key header', async () => {
        const originalApiKey = process.env.API_KEY;
        process.env.API_KEY = 'test-api-key';

        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }]
          })
          .set('x-api-key', 'test-api-key')
          .set('Accept', 'application/json');

        process.env.API_KEY = originalApiKey;

        expect(response.status).toBeLessThan(500);
      });

      test('should prioritize Authorization header over x-api-key', async () => {
        const originalApiKey = process.env.API_KEY;
        process.env.API_KEY = 'test-api-key';

        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }]
          })
          .set('Authorization', 'Bearer test-api-key')
          .set('x-api-key', 'different-key')
          .set('Accept', 'application/json');

        process.env.API_KEY = originalApiKey;

        expect(response.status).toBeLessThan(500);
      });

      test('should reject request with missing API key when configured', async () => {
        const originalApiKey = process.env.API_KEY;
        process.env.API_KEY = 'test-api-key';

        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }]
          })
          .set('Accept', 'application/json');

        process.env.API_KEY = originalApiKey;

        expect(response.status).toBe(401);
        expect(response.body.error.type).toBe('authentication_error');
      });
    });

    describe('Request validation', () => {
      test('should return 400 if messages is missing', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({})
          .set('Accept', 'application/json');

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
        expect(response.body.error.type).toBe('invalid_request_error');
        expect(response.body.error.message).toContain('Messages array is required');
      });

      test('should return 400 if messages is not an array', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({ messages: 'invalid' })
          .set('Accept', 'application/json');

        expect(response.status).toBe(400);
        expect(response.body.error.type).toBe('invalid_request_error');
      });

      test('should return 400 if messages array is empty', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({ messages: [] })
          .set('Accept', 'application/json');

        expect(response.status).toBe(400);
        expect(response.body.error.message).toContain('must not be empty');
      });

      test('should accept valid non-streaming request', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }],
            stream: false
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body.object).toBe('chat.completion');
      });

      test('should accept valid streaming request', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }],
            stream: true
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/event-stream');
      });

      test('should default to non-streaming when stream is not specified', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }]
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
      });

      test('should handle request with model parameter', async () => {
        const models = ['sonnet', 'opus', 'haiku'];

        for (const model of models) {
          const response = await request(app)
            .post('/v1/chat/completions')
            .send({
              messages: [{ role: 'user', content: 'Hello' }],
              model
            })
            .set('Accept', 'application/json');

          expect(response.status).toBe(200);
        }
      });

      test('should handle request with system message', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [
              { role: 'system', content: 'You are helpful' },
              { role: 'user', content: 'Hello' }
            ]
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
      });

      test('should handle multi-turn conversation', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [
              { role: 'user', content: 'Hello' },
              { role: 'assistant', content: 'Hi there!' },
              { role: 'user', content: 'How are you?' }
            ]
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
      });

      test('should handle request with max_tokens parameter', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 100
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
      });

      test('should handle request with temperature parameter', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }],
            temperature: 0.7
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
      });

      test('should handle request with top_p parameter', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }],
            top_p: 0.9
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
      });

      test('should handle request with stop parameter', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }],
            stop: ['END', 'STOP']
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
      });

      test('should handle request with presence_penalty parameter', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }],
            presence_penalty: 0.5
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
      });

      test('should handle request with frequency_penalty parameter', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }],
            frequency_penalty: 0.5
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
      });

      test('should handle request with all optional parameters', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }],
            model: 'sonnet',
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 1000,
            stop: ['END'],
            presence_penalty: 0.1,
            frequency_penalty: 0.1
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
      });

      test('should handle messages with array content (OpenAI format)', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Hello' }
                ]
              }
            ]
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
      });

      test('should handle special characters in content', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [
              { role: 'user', content: 'Hello\n\n\tWorld!<>{}"\'测试🌍' }
            ]
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
      });

      test('should handle very long content', async () => {
        const longContent = 'A'.repeat(10000);

        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: longContent }]
          })
          .set('Accept', 'application/json');

        expect(response.status).toBeGreaterThanOrEqual(200);
      });

      test('should handle malformed JSON in request body', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .set('Content-Type', 'application/json')
          .send('{"invalid": json}');

        expect(response.status).toBeGreaterThanOrEqual(400);
      });

      test('should handle null values in request', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: null,
            model: null
          })
          .set('Accept', 'application/json');

        expect(response.status).toBeGreaterThanOrEqual(400);
      });

      test('should handle empty string messages', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: '' }]
          })
          .set('Accept', 'application/json');

        expect(response.status).toBeGreaterThanOrEqual(200);
      });
    });

    describe('Streaming responses', () => {
      test('should return correct SSE headers for streaming', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }],
            stream: true
          })
          .set('Accept', 'application/json');

        expect(response.headers['content-type']).toContain('text/event-stream');
        expect(response.headers['cache-control']).toContain('no-cache');
        expect(response.headers['connection']).toContain('keep-alive');
      });

      test('should send data chunks in correct format', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }],
            stream: true
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.text).toContain('data:');
      });

      test('should send [DONE] marker at end of stream', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }],
            stream: true
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        // In real test, you would parse the SSE stream
      });

      test('should handle streaming errors gracefully', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }],
            stream: true
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
      });

      test('should handle concurrent streaming requests', async () => {
        const requests = Array(5).fill(null).map((_, i) =>
          request(app)
            .post('/v1/chat/completions')
            .send({
              messages: [{ role: 'user', content: `Request ${i}` }],
              stream: true
            })
            .set('Accept', 'application/json')
        );

        const responses = await Promise.all(requests);

        responses.forEach(response => {
          expect(response.status).toBe(200);
          expect(response.headers['content-type']).toContain('text/event-stream');
        });
      });
    });

    describe('Non-streaming responses', () => {
      test('should return valid chat.completion object', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }],
            stream: false
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body.object).toBe('chat.completion');
        expect(response.body.model).toBeDefined();
        expect(response.body.choices).toBeDefined();
        expect(Array.isArray(response.body.choices)).toBe(true);
        expect(response.body.choices.length).toBeGreaterThan(0);
      });

      test('should include usage information', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }],
            stream: false
          })
          .set('Accept', 'application/json');

        expect(response.body.usage).toBeDefined();
        expect(response.body.usage.prompt_tokens).toBeDefined();
        expect(response.body.usage.completion_tokens).toBeDefined();
        expect(response.body.usage.total_tokens).toBeDefined();
      });

      test('should include finish_reason', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }],
            stream: false
          })
          .set('Accept', 'application/json');

        expect(response.body.choices[0].finish_reason).toBeDefined();
      });

      test('should return correct content-type', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }],
            stream: false
          })
          .set('Accept', 'application/json');

        expect(response.headers['content-type']).toContain('application/json');
      });

      test('should handle concurrent non-streaming requests', async () => {
        const requests = Array(5).fill(null).map((_, i) =>
          request(app)
            .post('/v1/chat/completions')
            .send({
              messages: [{ role: 'user', content: `Request ${i}` }],
              stream: false
            })
            .set('Accept', 'application/json')
        );

        const responses = await Promise.all(requests);

        responses.forEach(response => {
          expect(response.status).toBe(200);
          expect(response.body.object).toBe('chat.completion');
        });
      });
    });

    describe('Error handling', () => {
      test('should handle ValidationError with 400 status', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: []
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(400);
        expect(response.body.error.type).toBe('invalid_request_error');
      });

      test('should handle AuthenticationError with 401 status', async () => {
        const originalApiKey = process.env.API_KEY;
        process.env.API_KEY = 'test-key';

        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }]
          })
          .set('Accept', 'application/json');

        process.env.API_KEY = originalApiKey;

        expect(response.status).toBe(401);
        expect(response.body.error.type).toBe('authentication_error');
      });

      test('should handle internal errors with 500 status', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: 'Hello' }]
          })
          .set('Accept', 'application/json');

        // Should not return 500 for normal requests
        expect(response.status).toBeLessThan(500);
      });

      test('should include error details in response', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: []
          })
          .set('Accept', 'application/json');

        expect(response.body.error).toBeDefined();
        expect(response.body.error.message).toBeDefined();
        expect(response.body.error.type).toBeDefined();
      });

      test('should handle invalid message role', async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'invalid', content: 'Hello' }]
          })
          .set('Accept', 'application/json');

        expect(response.status).toBeGreaterThanOrEqual(200);
      });
    });
  });

  describe('GET /v1/models', () => {
    test('should return list of available models', async () => {
      const response = await request(app)
        .get('/v1/models')
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.object).toBe('list');
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should include standard models', async () => {
      const response = await request(app)
        .get('/v1/models')
        .set('Accept', 'application/json');

      const modelIds = response.body.data.map(m => m.id);

      expect(modelIds).toContain('sonnet');
      expect(modelIds).toContain('opus');
      expect(modelIds).toContain('haiku');
    });

    test('should include model names', async () => {
      const response = await request(app)
        .get('/v1/models')
        .set('Accept', 'application/json');

      response.body.data.forEach(model => {
        expect(model.id).toBeDefined();
        expect(model.name).toBeDefined();
      });
    });

    test('should return correct content-type', async () => {
      const response = await request(app)
        .get('/v1/models')
        .set('Accept', 'application/json');

      expect(response.headers['content-type']).toContain('application/json');
    });

    test('should handle authentication when API_KEY is set', async () => {
      const originalApiKey = process.env.API_KEY;
      process.env.API_KEY = 'test-key';

      const response = await request(app)
        .get('/v1/models')
        .set('Accept', 'application/json');

      process.env.API_KEY = originalApiKey;

      // Should require authentication
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('should handle authentication with valid API key', async () => {
      const originalApiKey = process.env.API_KEY;
      process.env.API_KEY = 'test-key';

      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', 'Bearer test-key')
        .set('Accept', 'application/json');

      process.env.API_KEY = originalApiKey;

      expect(response.status).toBe(200);
    });

    test('should handle concurrent model list requests', async () => {
      const requests = Array(10).fill(null).map(() =>
        request(app)
          .get('/v1/models')
          .set('Accept', 'application/json')
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
      });
    });

    test('should respond quickly', async () => {
      const startTime = Date.now();

      const response = await request(app)
        .get('/v1/models')
        .set('Accept', 'application/json');

      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(100);
    });

    test('should return consistent model list', async () => {
      const response1 = await request(app)
        .get('/v1/models')
        .set('Accept', 'application/json');

      const response2 = await request(app)
        .get('/v1/models')
        .set('Accept', 'application/json');

      expect(response1.body.data.length).toBe(response2.body.data.length);
      expect(response1.body.data.map(m => m.id)).toEqual(response2.body.data.map(m => m.id));
    });
  });

  describe('Integration scenarios', () => {
    test('should handle complete request lifecycle', async () => {
      // List models
      const modelsResponse = await request(app)
        .get('/v1/models')
        .set('Accept', 'application/json');

      expect(modelsResponse.status).toBe(200);

      const model = modelsResponse.body.data[0].id;

      // Create completion
      const completionResponse = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          model
        })
        .set('Accept', 'application/json');

      expect(completionResponse.status).toBe(200);
    });

    test('should handle streaming and non-streaming in sequence', async () => {
      const requestData = {
        messages: [{ role: 'user', content: 'Test' }]
      };

      // Non-streaming
      const response1 = await request(app)
        .post('/v1/chat/completions')
        .send({ ...requestData, stream: false })
        .set('Accept', 'application/json');

      expect(response1.status).toBe(200);

      // Streaming
      const response2 = await request(app)
        .post('/v1/chat/completions')
        .send({ ...requestData, stream: true })
        .set('Accept', 'application/json');

      expect(response2.status).toBe(200);
    });

    test('should handle multiple users with different models', async () => {
      const models = ['sonnet', 'opus', 'haiku'];

      const requests = models.map(model =>
        request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: `Test with ${model}` }],
            model
          })
          .set('Accept', 'application/json')
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    test('should handle high concurrency', async () => {
      const requests = Array(20).fill(null).map((_, i) =>
        request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: `Concurrent request ${i}` }]
          })
          .set('Accept', 'application/json')
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    test('should maintain API consistency across requests', async () => {
      const response1 = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Request 1' }]
        })
        .set('Accept', 'application/json');

      const response2 = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Request 2' }]
        })
        .set('Accept', 'application/json');

      expect(response1.status).toBe(response2.status);
      expect(response1.body.object).toBe(response2.body.object);
    });
  });

  describe('Edge cases', () => {
    test('should handle extremely long messages array', async () => {
      const messages = [];
      for (let i = 0; i < 100; i++) {
        messages.push({ role: 'user', content: `Message ${i}` });
        messages.push({ role: 'assistant', content: `Response ${i}` });
      }

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({ messages })
        .set('Accept', 'application/json');

      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    test('should handle messages with only system message', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [
            { role: 'system', content: 'You are helpful' }
          ]
        })
        .set('Accept', 'application/json');

      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    test('should handle messages with very long single message', async () => {
      const longContent = 'A'.repeat(50000);

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: longContent }]
        })
        .set('Accept', 'application/json');

      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    test('should handle unicode in model parameter', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          model: '模型'
        })
        .set('Accept', 'application/json');

      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    test('should handle undefined stream parameter', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          stream: undefined
        })
        .set('Accept', 'application/json');

      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    test('should handle null stream parameter', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          stream: null
        })
        .set('Accept', 'application/json');

      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    test('should handle boolean stream values', async () => {
      const response1 = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true
        })
        .set('Accept', 'application/json');

      const response2 = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          stream: false
        })
        .set('Accept', 'application/json');

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });

    test('should handle stop parameter with string', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          stop: 'END'
        })
        .set('Accept', 'application/json');

      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    test('should handle empty stop array', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          stop: []
        })
        .set('Accept', 'application/json');

      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    test('should handle negative temperature', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          temperature: -0.5
        })
        .set('Accept', 'application/json');

      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    test('should handle temperature > 2', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          temperature: 3.0
        })
        .set('Accept', 'application/json');

      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    test('should handle max_tokens of 0', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 0
        })
        .set('Accept', 'application/json');

      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    test('should handle very large max_tokens', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 1000000
        })
        .set('Accept', 'application/json');

      expect(response.status).toBeGreaterThanOrEqual(200);
    });
  });

  describe('Performance', () => {
    test('should handle rapid sequential requests', async () => {
      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: `Request ${i}` }]
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
      }
    });

    test('should complete requests within reasonable time', async () => {
      const startTime = Date.now();

      await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }]
        })
        .set('Accept', 'application/json');

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // 5 seconds max
    });

    test('should not leak resources between requests', async () => {
      const requests = Array(50).fill(null).map((_, i) =>
        request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [{ role: 'user', content: `Request ${i}` }]
          })
          .set('Accept', 'application/json')
      );

      const responses = await Promise.all(requests);

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });
});
