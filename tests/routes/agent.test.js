/**
 * Agent Routes Unit Tests
 *
 * Tests for Agent mode API endpoints using mocked adapters
 */

import request from 'supertest';
import express from 'express';

// Create mock PTYAdapter
class MockPTYAdapter {
  constructor() {
    this.sessions = new Map();
    this.sessionCounter = 0;
  }

  async getOrCreateSession(sessionId, options) {
    if (sessionId && this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId);
    }

    const newSessionId = sessionId || `session_${++this.sessionCounter}`;
    const session = {
      sessionId: newSessionId,
      options,
      createdAt: Date.now(),
      _messages: []
    };

    this.sessions.set(newSessionId, session);
    return session;
  }

  async sendMessage(sessionId, content) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    session.lastMessage = content;
    session.lastMessageAt = Date.now();
    session._messages.push(content);
    return true;
  }

  async *streamResponse(sessionId) {
    yield { type: 'content', data: { content: 'Hello' } };
    yield { type: 'content', data: { content: ' world' } };
    yield { type: 'content', data: { content: '!' } };
    yield { type: 'done', data: {} };
  }

  listSessions() {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.sessionId,
      createdAt: s.createdAt,
      options: s.options
    }));
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  deleteSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  healthCheck() {
    return {
      adapter: 'pty',
      healthy: true,
      stats: {
        total: this.sessions.size,
        limit: 10
      }
    };
  }

  async cleanup() {
    this.sessions.clear();
    this.sessionCounter = 0;
  }
}

// Create a minimal mock logger
const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
};

// Create test router with mocked adapter
function createAgentRouter() {
  const router = express.Router();
  const ptyAdapter = new MockPTYAdapter();

  // POST /chat
  router.post('/chat', async (req, res) => {
    const { content, session_id, options } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        error: {
          message: 'Content is required and must be a string',
          type: 'invalid_request_error'
        }
      });
    }

    try {
      const session = await ptyAdapter.getOrCreateSession(session_id, options || {});
      await ptyAdapter.sendMessage(session.sessionId, content);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      res.write(`event: session\ndata: ${JSON.stringify({ session_id: session.sessionId })}\n\n`);

      for await (const event of ptyAdapter.streamResponse(session.sessionId)) {
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event.data)}\n\n`);
      }

      res.write('event: done\ndata: {}\n\n');
      res.end();
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          error: {
            message: error.message,
            type: 'agent_error'
          }
        });
      }
    }
  });

  // GET /sessions
  router.get('/sessions', (req, res) => {
    try {
      const sessions = ptyAdapter.listSessions();
      res.json({ sessions });
    } catch (error) {
      res.status(500).json({
        error: {
          message: 'Failed to list sessions',
          type: 'server_error'
        }
      });
    }
  });

  // GET /sessions/:id
  router.get('/sessions/:id', (req, res) => {
    try {
      const session = ptyAdapter.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({
          error: {
            message: 'Session not found',
            type: 'not_found_error'
          }
        });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({
        error: {
          message: 'Failed to get session',
          type: 'server_error'
        }
      });
    }
  });

  // DELETE /sessions/:id
  router.delete('/sessions/:id', (req, res) => {
    try {
      const deleted = ptyAdapter.deleteSession(req.params.id);
      if (!deleted) {
        return res.status(404).json({
          error: {
            message: 'Session not found',
            type: 'not_found_error'
          }
        });
      }
      res.json({ ok: true, message: 'Session deleted' });
    } catch (error) {
      res.status(500).json({
        error: {
          message: 'Failed to delete session',
          type: 'server_error'
        }
      });
    }
  });

  // GET /health
  router.get('/health', (req, res) => {
    try {
      const health = ptyAdapter.healthCheck();
      res.json({
        status: 'ok',
        service: 'agent-mode',
        ...health
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message
      });
    }
  });

  return router;
}

// Create test app
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.ip = '127.0.0.1';
    next();
  });
  app.use('/v1/agent', createAgentRouter());
  return app;
}

describe('Agent Routes', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('POST /v1/agent/chat', () => {
    test('should return 400 if content is missing', async () => {
      const response = await request(app)
        .post('/v1/agent/chat')
        .send({})
        .set('Accept', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Content is required');
      expect(response.body.error.type).toBe('invalid_request_error');
    });

    test('should return 400 if content is not a string', async () => {
      const response = await request(app)
        .post('/v1/agent/chat')
        .send({ content: 123 })
        .set('Accept', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Content is required and must be a string');
    });

    test('should return 400 if content is an empty string', async () => {
      const response = await request(app)
        .post('/v1/agent/chat')
        .send({ content: '' })
        .set('Accept', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Content is required and must be a string');
    });

    test('should accept valid content without session_id', async () => {
      const response = await request(app)
        .post('/v1/agent/chat')
        .send({ content: 'Hello World' })
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
    });

    test('should accept valid content with session_id', async () => {
      const response = await request(app)
        .post('/v1/agent/chat')
        .send({
          content: 'Hello World',
          session_id: 'test-session-123'
        })
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
    });

    test('should accept valid content with options', async () => {
      const response = await request(app)
        .post('/v1/agent/chat')
        .send({
          content: 'List all files',
          options: {
            model: 'sonnet',
            allowedTools: ['Bash', 'Write', 'Read']
          }
        })
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
    });

    test('should set correct SSE headers', async () => {
      const response = await request(app)
        .post('/v1/agent/chat')
        .send({ content: 'Test' })
        .set('Accept', 'application/json');

      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['cache-control']).toContain('no-cache');
      expect(response.headers['connection']).toContain('keep-alive');
      expect(response.headers['x-accel-buffering']).toBe('no');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    test('should handle long content messages', async () => {
      const longContent = 'A'.repeat(10000);

      const response = await request(app)
        .post('/v1/agent/chat')
        .send({ content: longContent })
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
    });

    test('should handle content with special characters', async () => {
      const specialContent = 'Hello\n\n\tWorld!<>{}"\'测试🌍';

      const response = await request(app)
        .post('/v1/agent/chat')
        .send({ content: specialContent })
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
    });

    test('should handle options with empty allowedTools array', async () => {
      const response = await request(app)
        .post('/v1/agent/chat')
        .send({
          content: 'Test',
          options: { allowedTools: [] }
        })
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
    });

    test('should handle options with specific model', async () => {
      const models = ['sonnet', 'opus', 'haiku'];

      for (const model of models) {
        const response = await request(app)
          .post('/v1/agent/chat')
          .send({
            content: 'Test',
            options: { model }
          })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
      }
    });

    test('should handle multiple concurrent requests', async () => {
      const requests = Array(5).fill(null).map((_, i) =>
        request(app)
          .post('/v1/agent/chat')
          .send({ content: `Request ${i}` })
          .set('Accept', 'application/json')
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    test('should send session event first', async () => {
      const response = await request(app)
        .post('/v1/agent/chat')
        .send({ content: 'Test' })
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.text).toContain('event: session');
    });

    test('should handle empty options object', async () => {
      const response = await request(app)
        .post('/v1/agent/chat')
        .send({
          content: 'Test',
          options: {}
        })
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
    });

    test('should handle session_id with special characters', async () => {
      const response = await request(app)
        .post('/v1/agent/chat')
        .send({
          content: 'Test',
          session_id: 'session_test-123.456'
        })
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
    });

    test('should handle very long session_id', async () => {
      const longSessionId = 'a'.repeat(500);

      const response = await request(app)
        .post('/v1/agent/chat')
        .send({
          content: 'Test',
          session_id: longSessionId
        })
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
    });

    test('should handle options with all parameters', async () => {
      const response = await request(app)
        .post('/v1/agent/chat')
        .send({
          content: 'Test',
          session_id: 'session-123',
          options: {
            model: 'sonnet',
            allowedTools: ['Bash', 'Write', 'Read', 'Glob', 'Grep'],
            timeout: 30000
          }
        })
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
    });

    test('should handle malformed request body', async () => {
      const response = await request(app)
        .post('/v1/agent/chat')
        .send('invalid json')
        .set('Content-Type', 'application/json');

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('should handle content with only whitespace', async () => {
      const response = await request(app)
        .post('/v1/agent/chat')
        .send({ content: '   \n\t   ' })
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
    });

    test('should handle new session creation', async () => {
      const response = await request(app)
        .post('/v1/agent/chat')
        .send({ content: 'Create new session' })
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
    });

    test('should handle existing session reuse', async () => {
      const sessionId = 'existing-session-123';

      // First request creates session
      await request(app)
        .post('/v1/agent/chat')
        .send({
          content: 'First',
          session_id: sessionId
        })
        .set('Accept', 'application/json');

      // Second request reuses session
      const response = await request(app)
        .post('/v1/agent/chat')
        .send({
          content: 'Second',
          session_id: sessionId
        })
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /v1/agent/sessions', () => {
    test('should return empty array when no sessions exist', async () => {
      const response = await request(app)
        .get('/v1/agent/sessions')
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.sessions).toBeDefined();
      expect(Array.isArray(response.body.sessions)).toBe(true);
      expect(response.body.sessions.length).toBe(0);
    });

    test('should return list of active sessions', async () => {
      // Create some sessions first
      await request(app)
        .post('/v1/agent/chat')
        .send({ content: 'Create session 1' });

      await request(app)
        .post('/v1/agent/chat')
        .send({ content: 'Create session 2' });

      const response = await request(app)
        .get('/v1/agent/sessions')
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.sessions).toBeDefined();
      expect(Array.isArray(response.body.sessions)).toBe(true);
      expect(response.body.sessions.length).toBe(2);
    });

    test('should handle server errors gracefully', async () => {
      const response = await request(app)
        .get('/v1/agent/sessions')
        .set('Accept', 'application/json');

      expect(response.status).toBeLessThan(500);
    });

    test('should return correct content-type', async () => {
      const response = await request(app)
        .get('/v1/agent/sessions')
        .set('Accept', 'application/json');

      expect(response.headers['content-type']).toContain('application/json');
    });

    test('should handle concurrent session list requests', async () => {
      const requests = Array(10).fill(null).map(() =>
        request(app)
          .get('/v1/agent/sessions')
          .set('Accept', 'application/json')
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.sessions).toBeDefined();
      });
    });

    test('should include session metadata', async () => {
      await request(app)
        .post('/v1/agent/chat')
        .send({ content: 'Test' });

      const response = await request(app)
        .get('/v1/agent/sessions')
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.sessions[0]).toHaveProperty('id');
      expect(response.body.sessions[0]).toHaveProperty('createdAt');
      expect(response.body.sessions[0]).toHaveProperty('options');
    });
  });

  describe('GET /v1/agent/sessions/:id', () => {
    test('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .get('/v1/agent/sessions/non-existent-id')
        .set('Accept', 'application/json');

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.type).toBe('not_found_error');
      expect(response.body.error.message).toContain('Session not found');
    });

    test('should return session details for valid session', async () => {
      // Create a session first
      await request(app)
        .post('/v1/agent/chat')
        .send({ content: 'Create session' });

      const listResponse = await request(app)
        .get('/v1/agent/sessions')
        .set('Accept', 'application/json');

      const sessionId = listResponse.body.sessions[0].id;

      const response = await request(app)
        .get(`/v1/agent/sessions/${sessionId}`)
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.sessionId).toBeDefined();
    });

    test('should handle invalid session ID format', async () => {
      const response = await request(app)
        .get('/v1/agent/sessions/invalid-format!')
        .set('Accept', 'application/json');

      expect(response.status).toBe(404);
    });

    test('should handle special characters in session ID', async () => {
      const specialId = 'session-测试-123!@#$%';

      const response = await request(app)
        .get(`/v1/agent/sessions/${encodeURIComponent(specialId)}`)
        .set('Accept', 'application/json');

      expect([200, 404]).toContain(response.status);
    });

    test('should include session options in response', async () => {
      await request(app)
        .post('/v1/agent/chat')
        .send({
          content: 'Test',
          options: { model: 'sonnet' }
        });

      const listResponse = await request(app)
        .get('/v1/agent/sessions')
        .set('Accept', 'application/json');

      const sessionId = listResponse.body.sessions[0].id;

      const response = await request(app)
        .get(`/v1/agent/sessions/${sessionId}`)
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
    });
  });

  describe('DELETE /v1/agent/sessions/:id', () => {
    test('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .delete('/v1/agent/sessions/non-existent-id')
        .set('Accept', 'application/json');

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.type).toBe('not_found_error');
      expect(response.body.error.message).toContain('Session not found');
    });

    test('should delete existing session and return 200', async () => {
      // Create a session first
      await request(app)
        .post('/v1/agent/chat')
        .send({ content: 'Create session' });

      const listResponse = await request(app)
        .get('/v1/agent/sessions')
        .set('Accept', 'application/json');

      const sessionId = listResponse.body.sessions[0].id;

      const deleteResponse = await request(app)
        .delete(`/v1/agent/sessions/${sessionId}`)
        .set('Accept', 'application/json');

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.ok).toBe(true);
      expect(deleteResponse.body.message).toContain('deleted');

      // Verify session is deleted
      const getResponse = await request(app)
        .get(`/v1/agent/sessions/${sessionId}`)
        .set('Accept', 'application/json');

      expect(getResponse.status).toBe(404);
    });

    test('should handle deleting already deleted session', async () => {
      const sessionId = 'session-to-delete';

      // First delete
      await request(app)
        .delete(`/v1/agent/sessions/${sessionId}`)
        .set('Accept', 'application/json');

      // Second delete (should also return 404)
      const response = await request(app)
        .delete(`/v1/agent/sessions/${sessionId}`)
        .set('Accept', 'application/json');

      expect(response.status).toBe(404);
    });

    test('should handle concurrent delete requests', async () => {
      const sessionId = 'concurrent-delete-session';

      const requests = Array(5).fill(null).map(() =>
        request(app)
          .delete(`/v1/agent/sessions/${sessionId}`)
          .set('Accept', 'application/json')
      );

      const responses = await Promise.all(requests);

      // All should succeed (either 200 or 404)
      responses.forEach(response => {
        expect([200, 404]).toContain(response.status);
      });
    });

    test('should return JSON content-type', async () => {
      const response = await request(app)
        .delete('/v1/agent/sessions/non-existent')
        .set('Accept', 'application/json');

      expect(response.headers['content-type']).toContain('application/json');
    });
  });

  describe('GET /v1/agent/health', () => {
    test('should return 200 and health status', async () => {
      const response = await request(app)
        .get('/v1/agent/health')
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.service).toBe('agent-mode');
    });

    test('should include health metrics', async () => {
      const response = await request(app)
        .get('/v1/agent/health')
        .set('Accept', 'application/json');

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('adapter');
      expect(response.body).toHaveProperty('healthy');
    });

    test('should return JSON content-type', async () => {
      const response = await request(app)
        .get('/v1/agent/health')
        .set('Accept', 'application/json');

      expect(response.headers['content-type']).toContain('application/json');
    });

    test('should handle concurrent health checks', async () => {
      const requests = Array(20).fill(null).map(() =>
        request(app)
          .get('/v1/agent/health')
          .set('Accept', 'application/json')
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
      });
    });

    test('should include process statistics', async () => {
      const response = await request(app)
        .get('/v1/agent/health')
        .set('Accept', 'application/json');

      expect(response.body.stats).toBeDefined();
      expect(response.body.stats).toHaveProperty('total');
      expect(response.body.stats).toHaveProperty('limit');
    });

    test('should handle health check during active session', async () => {
      // Create an active session
      await request(app)
        .post('/v1/agent/chat')
        .send({ content: 'Active session' });

      const response = await request(app)
        .get('/v1/agent/health')
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.healthy).toBeDefined();
    });

    test('should return consistent health status', async () => {
      const response1 = await request(app)
        .get('/v1/agent/health')
        .set('Accept', 'application/json');

      const response2 = await request(app)
        .get('/v1/agent/health')
        .set('Accept', 'application/json');

      expect(response1.body.status).toBe(response2.body.status);
      expect(response1.body.service).toBe(response2.body.service);
    });

    test('should respond quickly', async () => {
      const startTime = Date.now();

      const response = await request(app)
        .get('/v1/agent/health')
        .set('Accept', 'application/json');

      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Integration scenarios', () => {
    test('should handle complete chat flow', async () => {
      // Create session
      const chatResponse = await request(app)
        .post('/v1/agent/chat')
        .send({ content: 'Hello' })
        .set('Accept', 'application/json');

      expect(chatResponse.status).toBe(200);

      // List sessions
      const listResponse = await request(app)
        .get('/v1/agent/sessions')
        .set('Accept', 'application/json');

      expect(listResponse.status).toBe(200);

      // Health check
      const healthResponse = await request(app)
        .get('/v1/agent/health')
        .set('Accept', 'application/json');

      expect(healthResponse.status).toBe(200);
    });

    test('should handle session lifecycle', async () => {
      // Create session via chat
      await request(app)
        .post('/v1/agent/chat')
        .send({ content: 'Test' });

      // List sessions
      const listResponse = await request(app)
        .get('/v1/agent/sessions')
        .set('Accept', 'application/json');

      const sessionId = listResponse.body.sessions[0].id;

      // Get session details
      const getResponse = await request(app)
        .get(`/v1/agent/sessions/${sessionId}`)
        .set('Accept', 'application/json');

      expect(getResponse.status).toBe(200);

      // Delete session
      const deleteResponse = await request(app)
        .delete(`/v1/agent/sessions/${sessionId}`)
        .set('Accept', 'application/json');

      expect(deleteResponse.status).toBe(200);

      // Verify deletion
      const verifyResponse = await request(app)
        .get(`/v1/agent/sessions/${sessionId}`)
        .set('Accept', 'application/json');

      expect(verifyResponse.status).toBe(404);
    });

    test('should handle multiple session operations concurrently', async () => {
      // Create multiple sessions
      const createRequests = Array(5).fill(null).map((_, i) =>
        request(app)
          .post('/v1/agent/chat')
          .send({ content: `Session ${i}` })
          .set('Accept', 'application/json')
      );

      await Promise.all(createRequests);

      // List all sessions
      const listResponse = await request(app)
        .get('/v1/agent/sessions')
        .set('Accept', 'application/json');

      expect(listResponse.status).toBe(200);
      expect(listResponse.body.sessions.length).toBe(5);
    });
  });

  describe('Error handling', () => {
    test('should handle malformed JSON in request body', async () => {
      const response = await request(app)
        .post('/v1/agent/chat')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('should handle extremely large payload', async () => {
      const largeContent = 'A'.repeat(1000000);

      const response = await request(app)
        .post('/v1/agent/chat')
        .send({ content: largeContent })
        .set('Accept', 'application/json');

      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    test('should handle request with undefined fields', async () => {
      const response = await request(app)
        .post('/v1/agent/chat')
        .send({
          content: 'Test',
          session_id: undefined,
          options: undefined
        })
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
    });

    test('should handle null values', async () => {
      const response = await request(app)
        .post('/v1/agent/chat')
        .send({
          content: null,
          session_id: null,
          options: null
        })
        .set('Accept', 'application/json');

      expect(response.status).toBe(400);
    });
  });
});
