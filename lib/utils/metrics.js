/**
 * Metrics Collector
 *
 * Collects and tracks performance metrics for monitoring and analysis.
 *
 * @module lib/utils/metrics
 */

export class MetricsCollector {
  constructor() {
    this.metrics = {
      requestCount: 0,
      totalResponseTime: 0,
      errorCount: 0,
      processPoolUsage: 0,
      lastReset: Date.now()
    };

    this.requestTimes = [];
    this.maxRequestSamples = 1000;
  }

  /**
   * Record a request completion
   * @param {number} duration - Request duration in milliseconds
   * @param {boolean} success - Whether the request was successful
   * @param {string} endpoint - API endpoint
   */
  recordRequest(duration, success, endpoint = 'unknown') {
    this.metrics.requestCount++;
    this.metrics.totalResponseTime += duration;

    if (!success) {
      this.metrics.errorCount++;
    }

    // Store request time for percentile calculations
    this.requestTimes.push({
      duration,
      success,
      endpoint,
      timestamp: Date.now()
    });

    // Keep only recent samples
    if (this.requestTimes.length > this.maxRequestSamples) {
      this.requestTimes.shift();
    }
  }

  /**
   * Update process pool usage
   * @param {number} activeProcesses - Number of active processes
   * @param {number} maxProcesses - Maximum number of processes
   */
  updateProcessPoolUsage(activeProcesses, maxProcesses) {
    this.metrics.processPoolUsage = activeProcesses / maxProcesses;
  }

  /**
   * Get percentile of request times
   * @param {number} percentile - Percentile to calculate (0-100)
   * @returns {number} Request duration at the given percentile
   */
  getPercentile(percentile) {
    if (this.requestTimes.length === 0) {
      return 0;
    }

    const sortedTimes = this.requestTimes
      .map(r => r.duration)
      .sort((a, b) => a - b);

    const index = Math.ceil((percentile / 100) * sortedTimes.length) - 1;
    return sortedTimes[index];
  }

  /**
   * Get current statistics
   * @returns {Object} Current metrics statistics
   */
  getStats() {
    const uptime = Date.now() - this.metrics.lastReset;
    const uptimeSeconds = uptime / 1000;

    return {
      ...this.metrics,
      uptime: uptime,
      uptimeSeconds,
      avgResponseTime: this.metrics.requestCount > 0
        ? this.metrics.totalResponseTime / this.metrics.requestCount
        : 0,
      errorRate: this.metrics.requestCount > 0
        ? this.metrics.errorCount / this.metrics.requestCount
        : 0,
      requestsPerSecond: uptimeSeconds > 0
        ? this.metrics.requestCount / uptimeSeconds
        : 0,
      percentiles: {
        p50: this.getPercentile(50),
        p90: this.getPercentile(90),
        p95: this.getPercentile(95),
        p99: this.getPercentile(99)
      }
    };
  }

  /**
   * Get statistics by endpoint
   * @returns {Object} Statistics grouped by endpoint
   */
  getStatsByEndpoint() {
    const endpointStats = {};

    this.requestTimes.forEach(request => {
      if (!endpointStats[request.endpoint]) {
        endpointStats[request.endpoint] = {
          count: 0,
          totalTime: 0,
          errorCount: 0,
          times: []
        };
      }

      endpointStats[request.endpoint].count++;
      endpointStats[request.endpoint].totalTime += request.duration;
      if (!request.success) {
        endpointStats[request.endpoint].errorCount++;
      }
      endpointStats[request.endpoint].times.push(request.duration);
    });

    // Calculate averages and percentiles for each endpoint
    Object.keys(endpointStats).forEach(endpoint => {
      const stats = endpointStats[endpoint];
      const sortedTimes = stats.times.sort((a, b) => a - b);

      endpointStats[endpoint] = {
        count: stats.count,
        avgTime: stats.totalTime / stats.count,
        errorRate: stats.errorCount / stats.count,
        p50: sortedTimes[Math.floor(sortedTimes.length * 0.5)],
        p90: sortedTimes[Math.floor(sortedTimes.length * 0.9)],
        p95: sortedTimes[Math.floor(sortedTimes.length * 0.95)]
      };
    });

    return endpointStats;
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = {
      requestCount: 0,
      totalResponseTime: 0,
      errorCount: 0,
      processPoolUsage: 0,
      lastReset: Date.now()
    };
    this.requestTimes = [];
  }

  /**
   * Get a formatted summary of metrics
   * @returns {string} Formatted metrics summary
   */
  getSummary() {
    const stats = this.getStats();

    return `
=== Metrics Summary ===
Uptime: ${stats.uptimeSeconds.toFixed(2)}s
Total Requests: ${stats.requestCount}
Requests/sec: ${stats.requestsPerSecond.toFixed(2)}
Avg Response Time: ${stats.avgResponseTime.toFixed(2)}ms
Error Rate: ${(stats.errorRate * 100).toFixed(2)}%
Process Pool Usage: ${(stats.processPoolUsage * 100).toFixed(1)}%

Percentiles:
  p50: ${stats.percentiles.p50.toFixed(2)}ms
  p90: ${stats.percentiles.p90.toFixed(2)}ms
  p95: ${stats.percentiles.p95.toFixed(2)}ms
  p99: ${stats.percentiles.p99.toFixed(2)}ms
=======================
    `.trim();
  }
}

// Export singleton instance
export const metrics = new MetricsCollector();
