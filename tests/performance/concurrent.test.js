/**
 * Concurrent Request Performance Tests
 *
 * Tests to measure system behavior under concurrent load.
 * Helps identify bottlenecks and ensure system stability.
 *
 * @module tests/performance/concurrent
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import axios from 'axios';
import { performance } from 'perf_hooks';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3912';
const API_KEY = process.env.TEST_API_KEY || '';

// Helper function to check if server is running
const checkServerRunning = async () => {
  try {
    await axios.get(`${BASE_URL}/health`, { timeout: 2000 });
    return true;
  } catch (error) {
    return false;
  }
};

describe('Concurrent Request Performance Tests', () => {
  let serverRunning = false;

  beforeAll(async () => {
    serverRunning = await checkServerRunning();
    if (!serverRunning) {
      console.warn('Server is not running, skipping concurrent tests');
    }
  });

  const testIfEnabled = serverRunning ? test : test.skip;

  describe('OpenAI Mode Concurrent Requests', () => {
    testIfEnabled('should handle 3 concurrent requests', async () => {
      const concurrency = 3;
      const startTime = performance.now();

      const promises = Array(concurrency).fill(null).map((_, i) =>
        axios.post(`${BASE_URL}/v1/chat/completions`, {
          model: 'sonnet',
          messages: [
            { role: 'user', content: `Say "Test ${i}"` }
          ],
          stream: false
        }, {
          headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
        })
      );

      const responses = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      console.log(`\nConcurrent requests: ${concurrency}`);
      console.log(`Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`Average per request: ${(totalTime / concurrency).toFixed(2)}ms`);
      console.log(`Requests per second: ${(concurrency / (totalTime / 1000)).toFixed(2)}\n`);

      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // All requests should complete in reasonable time
      expect(totalTime).toBeLessThan(15000);
    }, 30000);

    testIfEnabled('should handle 5 concurrent requests', async () => {
      const concurrency = 5;
      const startTime = performance.now();

      const promises = Array(concurrency).fill(null).map((_, i) =>
        axios.post(`${BASE_URL}/v1/chat/completions`, {
          model: 'sonnet',
          messages: [
            { role: 'user', content: `Count to ${i}` }
          ],
          stream: false
        }, {
          headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
        })
      );

      const responses = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      console.log(`\nConcurrent requests: ${concurrency}`);
      console.log(`Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`Average per request: ${(totalTime / concurrency).toFixed(2)}ms`);
      console.log(`Requests per second: ${(concurrency / (totalTime / 1000)).toFixed(2)}\n`);

      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Verify all responses are successful
      expect(responses.length).toBe(concurrency);
    }, 45000);

    testIfEnabled('should maintain response quality under load', async () => {
      const concurrency = 3;
      const promises = Array(concurrency).fill(null).map((_, i) =>
        axios.post(`${BASE_URL}/v1/chat/completions`, {
          model: 'sonnet',
          messages: [
            { role: 'user', content: `What is ${i} + ${i}?` }
          ],
          stream: false
        }, {
          headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
        })
      );

      const responses = await Promise.all(promises);

      responses.forEach((response, i) => {
        expect(response.status).toBe(200);
        expect(response.data.choices[0].message.content).toBeDefined();
        expect(response.data.choices[0].message.content.length).toBeGreaterThan(0);
      });
    }, 30000);
  });

  describe('Agent Mode Concurrent Requests', () => {
    testIfEnabled('should handle 3 concurrent sessions', async () => {
      const concurrency = 3;
      const startTime = performance.now();

      const promises = Array(concurrency).fill(null).map((_, i) =>
        axios.post(`${BASE_URL}/v1/agent/chat`, {
          content: `Say "Test ${i}"`,
          options: {
            model: 'sonnet'
          }
        }, {
          responseType: 'stream'
        }).then(async (response) => {
          return new Promise((resolve, reject) => {
            let data = '';
            response.data.on('data', (chunk) => {
              data += chunk;
            });
            response.data.on('end', () => resolve({ status: response.status, data }));
            response.data.on('error', reject);
          });
        })
      );

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      console.log(`\nAgent concurrent sessions: ${concurrency}`);
      console.log(`Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`Average per session: ${(totalTime / concurrency).toFixed(2)}ms\n`);

      results.forEach(result => {
        expect(result.status).toBe(200);
      });

      expect(totalTime).toBeLessThan(30000);
    }, 45000);
  });

  describe('Health Check Under Load', () => {
    testIfEnabled('should respond to health checks during load', async () => {
      const concurrency = 3;

      // Start load requests
      const loadPromises = Array(concurrency).fill(null).map(() =>
        axios.post(`${BASE_URL}/v1/chat/completions`, {
          model: 'sonnet',
          messages: [
            { role: 'user', content: 'Tell me a long story' }
          ],
          stream: false
        }, {
          headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
        })
      );

      // Wait a bit then check health
      await new Promise(resolve => setTimeout(resolve, 500));

      const healthStartTime = performance.now();
      const healthResponse = await axios.get(`${BASE_URL}/health`);
      const healthTime = performance.now() - healthStartTime;

      console.log(`Health check during load: ${healthTime.toFixed(2)}ms`);

      expect(healthResponse.status).toBe(200);
      expect(healthTime).toBeLessThan(500);

      // Wait for load requests to complete
      await Promise.all(loadPromises);
    }, 30000);
  });

  describe('Process Pool Efficiency', () => {
    testIfEnabled('should efficiently reuse processes', async () => {
      const requestCount = 5;
      const measurements = [];

      // First request (cold start)
      let start = performance.now();
      await axios.post(`${BASE_URL}/v1/chat/completions`, {
        model: 'sonnet',
        messages: [
          { role: 'user', content: 'Hi' }
        ],
        stream: false
      }, {
        headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
      });
      measurements.push(performance.now() - start);

      // Subsequent requests (warm starts)
      for (let i = 0; i < requestCount - 1; i++) {
        start = performance.now();
        await axios.post(`${BASE_URL}/v1/chat/completions`, {
          model: 'sonnet',
          messages: [
            { role: 'user', content: `Hi ${i}` }
          ],
          stream: false
        }, {
          headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
        });
        measurements.push(performance.now() - start);

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const coldStart = measurements[0];
      const warmStarts = measurements.slice(1);
      const avgWarmStart = warmStarts.reduce((a, b) => a + b, 0) / warmStarts.length;

      console.log('\n=== Process Pool Efficiency ===');
      console.log(`Cold start: ${coldStart.toFixed(2)}ms`);
      console.log(`Average warm start: ${avgWarmStart.toFixed(2)}ms`);
      console.log(`Improvement: ${((coldStart - avgWarmStart) / coldStart * 100).toFixed(2)}%`);
      console.log('==============================\n');

      // Warm starts should generally be faster (though this can vary)
      expect(avgWarmStart).toBeLessThan(coldStart * 1.5);
    }, 60000);
  });

  describe('Memory Usage Simulation', () => {
    testIfEnabled('should handle sequential requests without degradation', async () => {
      const requestCount = 5;
      const timings = [];

      for (let i = 0; i < requestCount; i++) {
        const start = performance.now();
        await axios.post(`${BASE_URL}/v1/chat/completions`, {
          model: 'sonnet',
          messages: [
            { role: 'user', content: `Request ${i}: What is the capital of France?` }
          ],
          stream: false
        }, {
          headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
        });
        timings.push(performance.now() - start);
      }

      console.log('\n=== Sequential Request Timings ===');
      timings.forEach((time, i) => {
        console.log(`Request ${i + 1}: ${time.toFixed(2)}ms`);
      });
      console.log('==================================\n');

      // Check for significant degradation (last request shouldn't be much slower)
      const firstAvg = timings.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
      const lastAvg = timings.slice(-2).reduce((a, b) => a + b, 0) / 2;

      // Last requests should not be more than 2x slower (allowing some variance)
      expect(lastAvg).toBeLessThan(firstAvg * 2);
    }, 60000);
  });

  describe('Error Rate Under Load', () => {
    testIfEnabled('should maintain low error rate under concurrent load', async () => {
      const concurrency = 5;
      const promises = Array(concurrency).fill(null).map((_, i) =>
        axios.post(`${BASE_URL}/v1/chat/completions`, {
          model: 'sonnet',
          messages: [
            { role: 'user', content: `Test ${i}` }
          ],
          stream: false
        }, {
          headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
        }).catch(error => ({ error: true, status: error.response?.status }))
      );

      const results = await Promise.all(promises);
      const errors = results.filter(r => r.error).length;
      const errorRate = errors / concurrency;

      console.log(`\nConcurrent requests: ${concurrency}`);
      console.log(`Errors: ${errors}`);
      console.log(`Error rate: ${(errorRate * 100).toFixed(2)}%\n`);

      // Error rate should be very low (< 20%)
      expect(errorRate).toBeLessThan(0.2);
    }, 30000);
  });
});
