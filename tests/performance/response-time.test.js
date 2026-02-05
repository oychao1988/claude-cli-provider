/**
 * Response Time Performance Tests
 *
 * Tests to measure and validate response times for various operations.
 * Helps identify performance bottlenecks and ensure SLA compliance.
 *
 * @module tests/performance/response-time
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import axios from 'axios';
import { performance } from 'perf_hooks';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3912';
const API_KEY = process.env.TEST_API_KEY || '';

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  HEALTH_CHECK: 100,
  OPENAI_FIRST_BYTE: 2000,
  OPENAI_COMPLETE: 5000,
  AGENT_FIRST_BYTE: 3000,
  AGENT_COMPLETE: 10000,
  PTY_STARTUP: 1000
};

// Helper function to measure request time
const measureRequest = async (requestFn) => {
  const startTime = performance.now();
  const response = await requestFn();
  const endTime = performance.now();
  return {
    duration: endTime - startTime,
    response
  };
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

describe('Response Time Performance Tests', () => {
  let serverRunning = false;

  beforeAll(async () => {
    serverRunning = await checkServerRunning();
    if (!serverRunning) {
      console.warn('Server is not running, skipping performance tests');
    }
  });

  const testIfEnabled = (name, callback, timeout) => {
    test(name, async () => {
      if (!serverRunning) {
        return;
      }
      await callback();
    }, timeout);
  };

  describe('Health Check Performance', () => {
    testIfEnabled('should respond to health check quickly', async () => {
      const { duration, response } = await measureRequest(() =>
        axios.get(`${BASE_URL}/health`)
      );

      console.log(`Health check response time: ${duration.toFixed(2)}ms`);

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(THRESHOLDS.HEALTH_CHECK);
    });
  });

  describe('OpenAI Mode Performance', () => {
    testIfEnabled('should return first byte quickly (non-streaming)', async () => {
      const startTime = performance.now();

      const response = await axios.post(`${BASE_URL}/v1/chat/completions`, {
        model: 'sonnet',
        messages: [
          { role: 'user', content: 'Say "Hello"' }
        ],
        stream: false
      }, {
        headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {},
        responseType: 'stream'
      });

      // Measure time to first byte
      let firstByteTime = null;
      response.data.on('data', () => {
        if (firstByteTime === null) {
          firstByteTime = performance.now() - startTime;
        }
      });

      await new Promise((resolve) => {
        response.data.on('end', resolve);
      });

      console.log(`OpenAI mode first byte: ${firstByteTime.toFixed(2)}ms`);

      expect(firstByteTime).toBeLessThan(THRESHOLDS.OPENAI_FIRST_BYTE);
    }, 10000);

    testIfEnabled('should complete simple request quickly', async () => {
      const { duration, response } = await measureRequest(() =>
        axios.post(`${BASE_URL}/v1/chat/completions`, {
          model: 'sonnet',
          messages: [
            { role: 'user', content: 'Say "OK"' }
          ],
          stream: false
        }, {
          headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
        })
      );

      console.log(`OpenAI mode complete time: ${duration.toFixed(2)}ms`);

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(THRESHOLDS.OPENAI_COMPLETE);
    }, 10000);

    testIfEnabled('should handle streaming with low latency', async () => {
      const startTime = performance.now();
      let firstChunkTime = null;
      let chunkCount = 0;

      const response = await axios.post(`${BASE_URL}/v1/chat/completions`, {
        model: 'sonnet',
        messages: [
          { role: 'user', content: 'Count from 1 to 5' }
        ],
        stream: true
      }, {
        headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {},
        responseType: 'stream'
      });

      response.data.on('data', (chunk) => {
        if (firstChunkTime === null) {
          firstChunkTime = performance.now() - startTime;
        }
        chunkCount++;
      });

      await new Promise((resolve) => {
        response.data.on('end', resolve);
      });

      const totalTime = performance.now() - startTime;

      console.log(`OpenAI streaming first chunk: ${firstChunkTime.toFixed(2)}ms`);
      console.log(`OpenAI streaming total time: ${totalTime.toFixed(2)}ms`);
      console.log(`OpenAI streaming chunks: ${chunkCount}`);

      expect(firstChunkTime).toBeLessThan(THRESHOLDS.OPENAI_FIRST_BYTE);
      expect(chunkCount).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Agent Mode Performance', () => {
    testIfEnabled('should return first byte quickly', async () => {
      const startTime = performance.now();
      let firstByteTime = null;

      const response = await axios.post(`${BASE_URL}/v1/agent/chat`, {
        content: 'Say "Hello"',
        options: {
          model: 'sonnet'
        }
      }, {
        responseType: 'stream'
      });

      response.data.on('data', () => {
        if (firstByteTime === null) {
          firstByteTime = performance.now() - startTime;
        }
      });

      await new Promise((resolve) => {
        response.data.on('end', resolve);
      });

      console.log(`Agent mode first byte: ${firstByteTime.toFixed(2)}ms`);

      expect(firstByteTime).toBeLessThan(THRESHOLDS.AGENT_FIRST_BYTE);
    }, 15000);

    testIfEnabled('should complete simple request in reasonable time', async () => {
      const startTime = performance.now();

      const response = await axios.post(`${BASE_URL}/v1/agent/chat`, {
        content: 'Say "OK"',
        options: {
          model: 'sonnet'
        }
      }, {
        responseType: 'stream'
      });

      response.data.on('data', () => {
        // Just consume the data
      });

      await new Promise((resolve) => {
        response.data.on('end', resolve);
      });

      const totalTime = performance.now() - startTime;

      console.log(`Agent mode complete time: ${totalTime.toFixed(2)}ms`);

      expect(totalTime).toBeLessThan(THRESHOLDS.AGENT_COMPLETE);
    }, 15000);
  });

  describe('PTY Process Startup', () => {
    testIfEnabled('should create PTY process quickly', async () => {
      const startTime = performance.now();
      let sessionEventTime = null;

      const response = await axios.post(`${BASE_URL}/v1/agent/chat`, {
        content: 'Hi',
        options: {
          model: 'sonnet'
        }
      }, {
        responseType: 'stream'
      });

      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        if (lines.some(line => line.includes('event: session'))) {
          if (sessionEventTime === null) {
            sessionEventTime = performance.now() - startTime;
          }
        }
      });

      await new Promise((resolve) => {
        response.data.on('end', resolve);
      });

      console.log(`PTY startup (session event): ${sessionEventTime.toFixed(2)}ms`);

      expect(sessionEventTime).toBeLessThan(THRESHOLDS.PTY_STARTUP);
    }, 15000);
  });

  describe('Performance Comparison', () => {
    testIfEnabled('OpenAI mode should be faster than Agent mode', async () => {
      // Measure OpenAI mode
      const openaiResult = await measureRequest(() =>
        axios.post(`${BASE_URL}/v1/chat/completions`, {
          model: 'sonnet',
          messages: [
            { role: 'user', content: 'Say "Test"' }
          ],
          stream: false
        }, {
          headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
        })
      );

      // Measure Agent mode
      const agentStart = performance.now();
      const agentResponse = await axios.post(`${BASE_URL}/v1/agent/chat`, {
        content: 'Say "Test"',
        options: {
          model: 'sonnet'
        }
      }, {
        responseType: 'stream'
      });

      agentResponse.data.on('data', () => {});

      await new Promise((resolve) => {
        agentResponse.data.on('end', resolve);
      });

      const agentDuration = performance.now() - agentStart;

      console.log(`OpenAI mode: ${openaiResult.duration.toFixed(2)}ms`);
      console.log(`Agent mode: ${agentDuration.toFixed(2)}ms`);
      console.log(`Difference: ${(agentDuration - openaiResult.duration).toFixed(2)}ms`);

      // OpenAI mode should generally be faster
      // This is a soft assertion - Agent mode has more overhead
      expect(openaiResult.duration).toBeLessThan(agentDuration);
    }, 20000);
  });

  describe('Performance Statistics', () => {
    testIfEnabled('collect baseline performance metrics', async () => {
      const measurements = [];

      // Run multiple requests
      for (let i = 0; i < 3; i++) {
        const { duration } = await measureRequest(() =>
          axios.post(`${BASE_URL}/v1/chat/completions`, {
            model: 'sonnet',
            messages: [
              { role: 'user', content: `Test ${i}` }
            ],
            stream: false
          }, {
            headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
          })
        );

        measurements.push(duration);
      }

      const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const min = Math.min(...measurements);
      const max = Math.max(...measurements);

      console.log('\n=== OpenAI Mode Performance Statistics ===');
      console.log(`Average: ${avg.toFixed(2)}ms`);
      console.log(`Min: ${min.toFixed(2)}ms`);
      console.log(`Max: ${max.toFixed(2)}ms`);
      console.log(`Samples: ${measurements.length}`);
      console.log('=========================================\n');

      expect(measurements.length).toBe(3);
      expect(avg).toBeLessThan(THRESHOLDS.OPENAI_COMPLETE);
    }, 30000);
  });
});
