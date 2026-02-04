/**
 * Memory Usage Tests
 *
 * Tests to monitor memory usage and detect potential memory leaks.
 *
 * @module tests/performance/memory
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import axios from 'axios';
import { performance } from 'perf_hooks';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3912';
const API_KEY = process.env.TEST_API_KEY || '';

// Helper function to get memory usage
const getMemoryUsage = () => {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss / 1024 / 1024, // MB
    heapTotal: usage.heapTotal / 1024 / 1024, // MB
    heapUsed: usage.heapUsed / 1024 / 1024, // MB
    external: usage.external / 1024 / 1024 // MB
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

describe('Memory Usage Tests', () => {
  let serverRunning = false;
  let initialMemory;

  beforeAll(async () => {
    serverRunning = await checkServerRunning();
    if (!serverRunning) {
      console.warn('Server is not running, skipping memory tests');
    }
    initialMemory = getMemoryUsage();
  });

  const testIfEnabled = serverRunning ? test : test.skip;

  describe('Baseline Memory', () => {
    testIfEnabled('should establish baseline memory usage', () => {
      console.log('\n=== Initial Memory Usage ===');
      console.log(`RSS: ${initialMemory.rss.toFixed(2)} MB`);
      console.log(`Heap Total: ${initialMemory.heapTotal.toFixed(2)} MB`);
      console.log(`Heap Used: ${initialMemory.heapUsed.toFixed(2)} MB`);
      console.log(`External: ${initialMemory.external.toFixed(2)} MB`);
      console.log('============================\n');

      expect(initialMemory.heapUsed).toBeGreaterThan(0);
    });
  });

  describe('Memory During Requests', () => {
    testIfEnabled('should not leak memory during sequential requests', async () => {
      const requestCount = 10;
      const memorySnapshots = [];

      // Take initial snapshot
      memorySnapshots.push(getMemoryUsage());

      // Make requests and take snapshots
      for (let i = 0; i < requestCount; i++) {
        await axios.post(`${BASE_URL}/v1/chat/completions`, {
          model: 'sonnet',
          messages: [
            { role: 'user', content: `Request ${i}: Say "OK"` }
          ],
          stream: false
        }, {
          headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
        });

        memorySnapshots.push(getMemoryUsage());

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Force garbage collection if available (requires --expose-gc flag)
      if (global.gc) {
        global.gc();
        memorySnapshots.push(getMemoryUsage());
      }

      console.log('\n=== Memory During Sequential Requests ===');
      memorySnapshots.forEach((snapshot, i) => {
        console.log(`Snapshot ${i}: Heap Used: ${snapshot.heapUsed.toFixed(2)} MB`);
      });
      console.log('=========================================\n');

      // Check for memory leak (heap should not grow continuously)
      const startHeap = memorySnapshots[0].heapUsed;
      const midHeap = memorySnapshots[Math.floor(memorySnapshots.length / 2)].heapUsed;
      const endHeap = memorySnapshots[memorySnapshots.length - 1].heapUsed;

      // End heap should not be more than 2x start heap (allowing some variance)
      expect(endHeap).toBeLessThan(startHeap * 2);

      // Mid heap should not be significantly larger than end heap
      expect(endHeap).toBeLessThan(midHeap * 1.5);
    }, 60000);

    testIfEnabled('should not leak memory during streaming requests', async () => {
      const requestCount = 5;
      const memorySnapshots = [];

      // Take initial snapshot
      memorySnapshots.push(getMemoryUsage());

      // Make streaming requests
      for (let i = 0; i < requestCount; i++) {
        const response = await axios.post(`${BASE_URL}/v1/chat/completions`, {
          model: 'sonnet',
          messages: [
            { role: 'user', content: `Count from 1 to ${i + 5}` }
          ],
          stream: true
        }, {
          headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {},
          responseType: 'stream'
        });

        await new Promise((resolve) => {
          response.data.on('data', () => {});
          response.data.on('end', resolve);
        });

        memorySnapshots.push(getMemoryUsage());
      }

      console.log('\n=== Memory During Streaming Requests ===');
      memorySnapshots.forEach((snapshot, i) => {
        console.log(`Snapshot ${i}: Heap Used: ${snapshot.heapUsed.toFixed(2)} MB`);
      });
      console.log('=======================================\n');

      const startHeap = memorySnapshots[0].heapUsed;
      const endHeap = memorySnapshots[memorySnapshots.length - 1].heapUsed;

      expect(endHeap).toBeLessThan(startHeap * 2);
    }, 60000);
  });

  describe('Session Memory', () => {
    testIfEnabled('should clean up session memory after deletion', async () => {
      const memorySnapshots = [];

      // Initial snapshot
      memorySnapshots.push(getMemoryUsage());

      // Create session
      const createResponse = await axios.post(`${BASE_URL}/v1/agent/chat`, {
        content: 'Remember the number 42',
        options: {
          model: 'sonnet'
        }
      }, {
        responseType: 'stream'
      });

      // Extract session ID
      let sessionId = null;
      createResponse.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        const sessionLine = lines.find(line => line.includes('event: session'));
        if (sessionLine && !sessionId) {
          const dataLine = lines[lines.indexOf(sessionLine) + 1];
          if (dataLine && dataLine.startsWith('data: ')) {
            try {
              const data = JSON.parse(dataLine.slice(6));
              sessionId = data.session_id;
            } catch (e) {}
          }
        }
      });

      await new Promise((resolve) => {
        createResponse.data.on('end', resolve);
      });

      memorySnapshots.push(getMemoryUsage());

      // Delete session
      if (sessionId) {
        await axios.delete(`${BASE_URL}/v1/agent/sessions/${sessionId}`);
      }

      // Small delay for cleanup
      await new Promise(resolve => setTimeout(resolve, 500));

      memorySnapshots.push(getMemoryUsage());

      console.log('\n=== Session Memory Usage ===');
      console.log(`Initial: ${memorySnapshots[0].heapUsed.toFixed(2)} MB`);
      console.log(`With session: ${memorySnapshots[1].heapUsed.toFixed(2)} MB`);
      console.log(`After cleanup: ${memorySnapshots[2].heapUsed.toFixed(2)} MB`);
      console.log('============================\n');

      // After cleanup, memory should be close to initial
      const memoryIncrease = memorySnapshots[2].heapUsed - memorySnapshots[0].heapUsed;

      // Allow up to 10 MB increase for other allocations
      expect(memoryIncrease).toBeLessThan(10);
    }, 30000);
  });

  describe('Memory Under Load', () => {
    testIfEnabled('should handle load without excessive memory growth', async () => {
      const concurrency = 5;
      const iterations = 2;
      const memorySnapshots = [];

      memorySnapshots.push(getMemoryUsage());

      for (let i = 0; i < iterations; i++) {
        const promises = Array(concurrency).fill(null).map((_, j) =>
          axios.post(`${BASE_URL}/v1/chat/completions`, {
            model: 'sonnet',
            messages: [
              { role: 'user', content: `Iteration ${i}, Request ${j}: Say "OK"` }
            ],
            stream: false
          }, {
            headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
          })
        );

        await Promise.all(promises);
        memorySnapshots.push(getMemoryUsage());
      }

      console.log('\n=== Memory Under Load ===');
      memorySnapshots.forEach((snapshot, i) => {
        console.log(`Snapshot ${i}: ${snapshot.heapUsed.toFixed(2)} MB`);
      });
      console.log('=========================\n');

      const maxHeap = Math.max(...memorySnapshots.map(s => s.heapUsed));
      const minHeap = Math.min(...memorySnapshots.map(s => s.heapUsed));
      const growth = maxHeap - minHeap;

      console.log(`Memory growth: ${growth.toFixed(2)} MB`);

      // Memory growth should be reasonable (< 50 MB for this test)
      expect(growth).toBeLessThan(50);
    }, 60000);
  });

  describe('Memory Efficiency', () => {
    testIfEnabled('should maintain reasonable memory per request', async () => {
      const requestCount = 20;
      const startMemory = getMemoryUsage();

      // Make requests
      for (let i = 0; i < requestCount; i++) {
        await axios.post(`${BASE_URL}/v1/chat/completions`, {
          model: 'sonnet',
          messages: [
            { role: 'user', content: `Request ${i}: Hi` }
          ],
          stream: false
        }, {
          headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
        });
      }

      const endMemory = getMemoryUsage();
      const memoryPerRequest = (endMemory.heapUsed - startMemory.heapUsed) / requestCount;

      console.log('\n=== Memory Efficiency ===');
      console.log(`Start: ${startMemory.heapUsed.toFixed(2)} MB`);
      console.log(`End: ${endMemory.heapUsed.toFixed(2)} MB`);
      console.log(`Total growth: ${(endMemory.heapUsed - startMemory.heapUsed).toFixed(2)} MB`);
      console.log(`Per request: ${memoryPerRequest.toFixed(2)} MB`);
      console.log('========================\n');

      // Memory per request should be reasonable (< 1 MB per request)
      expect(memoryPerRequest).toBeLessThan(1);
    }, 120000);
  });
});
