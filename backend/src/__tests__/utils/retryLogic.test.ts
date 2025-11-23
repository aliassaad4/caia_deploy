/**
 * Tests for Retry Logic with Exponential Backoff
 */

import {
  calculateDelay,
  isRetryableError,
  withRetry,
  createRetryWrapper,
  withCircuitBreaker,
  getCircuitBreakerStatus,
  resetCircuitBreaker,
  trackRetryStats,
  getRetryStats,
  resetRetryStats,
} from '../../utils/retryLogic';

describe('Retry Logic', () => {
  beforeEach(() => {
    resetRetryStats();
    resetCircuitBreaker('test');
  });

  describe('calculateDelay', () => {
    it('should calculate exponential delay', () => {
      const baseDelay = 1000;
      const maxDelay = 30000;
      const multiplier = 2;

      const delay0 = calculateDelay(0, baseDelay, maxDelay, multiplier);
      const delay1 = calculateDelay(1, baseDelay, maxDelay, multiplier);
      const delay2 = calculateDelay(2, baseDelay, maxDelay, multiplier);

      // Account for jitter (±25%)
      expect(delay0).toBeGreaterThanOrEqual(750);
      expect(delay0).toBeLessThanOrEqual(1250);

      expect(delay1).toBeGreaterThanOrEqual(1500);
      expect(delay1).toBeLessThanOrEqual(2500);

      expect(delay2).toBeGreaterThanOrEqual(3000);
      expect(delay2).toBeLessThanOrEqual(5000);
    });

    it('should cap delay at maxDelay', () => {
      const delay = calculateDelay(10, 1000, 5000, 2);
      expect(delay).toBeLessThanOrEqual(6250); // maxDelay + 25% jitter
    });

    it('should add jitter to prevent thundering herd', () => {
      const delays = new Set<number>();
      for (let i = 0; i < 10; i++) {
        delays.add(calculateDelay(1, 1000, 30000, 2));
      }
      // With jitter, we should get different values
      expect(delays.size).toBeGreaterThan(1);
    });
  });

  describe('isRetryableError', () => {
    const options = {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      retryableStatusCodes: [429, 500, 502, 503, 504],
      retryableErrors: ['ECONNRESET', 'ETIMEDOUT'],
    };

    it('should identify network errors as retryable', () => {
      const error = { code: 'ECONNRESET' };
      expect(isRetryableError(error, options)).toBe(true);
    });

    it('should identify timeout errors as retryable', () => {
      const error = { code: 'ETIMEDOUT' };
      expect(isRetryableError(error, options)).toBe(true);
    });

    it('should identify 500 status codes as retryable', () => {
      const error = { response: { status: 500 } };
      expect(isRetryableError(error, options)).toBe(true);
    });

    it('should identify 429 (rate limit) as retryable', () => {
      const error = { response: { status: 429 } };
      expect(isRetryableError(error, options)).toBe(true);
    });

    it('should identify rate limit messages as retryable', () => {
      const error = { message: 'Rate limit exceeded' };
      expect(isRetryableError(error, options)).toBe(true);
    });

    it('should identify timeout messages as retryable', () => {
      const error = { message: 'Request timeout' };
      expect(isRetryableError(error, options)).toBe(true);
    });

    it('should not identify 400 errors as retryable', () => {
      const error = { response: { status: 400 } };
      expect(isRetryableError(error, options)).toBe(false);
    });

    it('should not identify 404 errors as retryable', () => {
      const error = { response: { status: 404 } };
      expect(isRetryableError(error, options)).toBe(false);
    });
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      let attempts = 0;
      const fn = jest.fn(async () => {
        attempts++;
        return 'success';
      });

      const result = await withRetry(fn, { maxRetries: 3 });

      expect(result).toBe('success');
      expect(attempts).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      let attempts = 0;
      const fn = jest.fn(async () => {
        attempts++;
        if (attempts < 3) {
          const error: any = new Error('Connection reset');
          error.code = 'ECONNRESET';
          throw error;
        }
        return 'success';
      });

      const result = await withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 10,
        maxDelayMs: 100,
      });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should throw after max retries exceeded', async () => {
      const fn = jest.fn(async () => {
        const error: any = new Error('Server error');
        error.response = { status: 500 };
        throw error;
      });

      await expect(
        withRetry(fn, {
          maxRetries: 2,
          baseDelayMs: 10,
          maxDelayMs: 100,
        })
      ).rejects.toThrow('Server error');

      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      const fn = jest.fn(async () => {
        const error: any = new Error('Bad request');
        error.response = { status: 400 };
        throw error;
      });

      await expect(
        withRetry(fn, {
          maxRetries: 3,
          baseDelayMs: 10,
        })
      ).rejects.toThrow('Bad request');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should call onRetry callback', async () => {
      const onRetry = jest.fn();
      let attempts = 0;
      const fn = jest.fn(async () => {
        attempts++;
        if (attempts < 2) {
          const error: any = new Error('Timeout');
          error.code = 'ETIMEDOUT';
          throw error;
        }
        return 'success';
      });

      await withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
    });
  });

  describe('createRetryWrapper', () => {
    it('should create a wrapped function with retry logic', async () => {
      let attempts = 0;
      const originalFn = async (value: string) => {
        attempts++;
        if (attempts < 2) {
          const error: any = new Error('Retry');
          error.code = 'ECONNRESET';
          throw error;
        }
        return `result: ${value}`;
      };

      const wrappedFn = createRetryWrapper(originalFn, {
        maxRetries: 3,
        baseDelayMs: 10,
      });

      const result = await wrappedFn('test');
      expect(result).toBe('result: test');
      expect(attempts).toBe(2);
    });
  });

  describe('Circuit Breaker', () => {
    it('should allow requests when circuit is closed', async () => {
      const fn = jest.fn(async () => 'success');

      const result = await withCircuitBreaker('test', fn);
      expect(result).toBe('success');
    });

    it('should open circuit after failure threshold', async () => {
      const fn = jest.fn(async () => {
        throw new Error('Fail');
      });

      // Cause failures to open circuit
      for (let i = 0; i < 5; i++) {
        try {
          await withCircuitBreaker('test', fn, { failureThreshold: 5 });
        } catch (e) {
          // Expected
        }
      }

      const status = getCircuitBreakerStatus('test');
      expect(status?.state).toBe('open');
    });

    it('should reject requests when circuit is open', async () => {
      const fn = jest.fn(async () => {
        throw new Error('Fail');
      });

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await withCircuitBreaker('test', fn, { failureThreshold: 5 });
        } catch (e) {
          // Expected
        }
      }

      // Next request should be rejected
      await expect(
        withCircuitBreaker('test', async () => 'success', { failureThreshold: 5 })
      ).rejects.toThrow('Circuit breaker test is open');
    });

    it('should reset circuit breaker', () => {
      resetCircuitBreaker('test');
      const status = getCircuitBreakerStatus('test');
      expect(status).toBeUndefined();
    });
  });

  describe('Retry Statistics', () => {
    it('should track retry statistics', () => {
      trackRetryStats('api-call', true, 2);
      trackRetryStats('api-call', true, 0);
      trackRetryStats('api-call', false, 3);

      const stats = getRetryStats('api-call');
      expect(stats).toBeDefined();
      expect((stats as any).totalCalls).toBe(3);
      expect((stats as any).successfulCalls).toBe(2);
      expect((stats as any).failedCalls).toBe(1);
      expect((stats as any).totalRetries).toBe(5);
    });

    it('should calculate average retries', () => {
      trackRetryStats('api-call', true, 3);
      trackRetryStats('api-call', true, 6);

      const stats = getRetryStats('api-call');
      expect((stats as any).averageRetries).toBe(4.5);
    });

    it('should reset statistics', () => {
      trackRetryStats('api-call', true, 1);
      resetRetryStats('api-call');
      const stats = getRetryStats('api-call');
      expect(stats).toBeUndefined();
    });
  });
});
