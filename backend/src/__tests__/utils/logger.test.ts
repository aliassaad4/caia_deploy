import {
  startLatencyTracking,
  endLatencyTracking,
  getLatencyStats,
  logApiRequest,
  logApiResponse,
  logAiOperation,
  logSecurityEvent,
} from '../../utils/logger';

describe('Logger', () => {
  describe('Latency Tracking', () => {
    it('should track latency for an operation', () => {
      const metrics = startLatencyTracking('test_operation', { userId: 'test' });
      expect(metrics.operation).toBe('test_operation');
      expect(metrics.startTime).toBeDefined();

      // Simulate some work
      const duration = endLatencyTracking(metrics);
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(metrics.endTime).toBeDefined();
      expect(metrics.duration).toBeDefined();
    });

    it('should calculate latency statistics', () => {
      // Track multiple operations
      for (let i = 0; i < 5; i++) {
        const m = startLatencyTracking('stats_test');
        endLatencyTracking(m);
      }

      const stats = getLatencyStats('stats_test');
      expect(stats.count).toBeGreaterThanOrEqual(5);
      expect(stats.avgMs).toBeGreaterThanOrEqual(0);
      expect(stats.minMs).toBeDefined();
      expect(stats.maxMs).toBeDefined();
      expect(stats.p50Ms).toBeDefined();
      expect(stats.p95Ms).toBeDefined();
    });

    it('should return empty stats for unknown operation', () => {
      const stats = getLatencyStats('nonexistent_operation');
      expect(stats.count).toBe(0);
      expect(stats.avgMs).toBe(0);
    });
  });

  describe('Log Functions', () => {
    it('should log API request without error', () => {
      expect(() => {
        logApiRequest({
          method: 'GET',
          path: '/api/test',
          userId: 'user-123',
          ip: '127.0.0.1',
        });
      }).not.toThrow();
    });

    it('should log API response without error', () => {
      expect(() => {
        logApiResponse({
          method: 'GET',
          path: '/api/test',
          statusCode: 200,
          duration: 150,
          userId: 'user-123',
        });
      }).not.toThrow();
    });

    it('should log AI operation without error', () => {
      expect(() => {
        logAiOperation({
          operation: 'chat_response',
          model: 'gpt-4o',
          tokens: 500,
          cost: 0.005,
          duration: 1500,
          userId: 'user-123',
          success: true,
        });
      }).not.toThrow();
    });

    it('should log security event without error', () => {
      expect(() => {
        logSecurityEvent({
          type: 'prompt_injection_attempt',
          severity: 'high',
          userId: 'user-123',
          details: { riskScore: 75 },
        });
      }).not.toThrow();
    });
  });
});
