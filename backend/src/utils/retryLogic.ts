/**
 * Retry Logic with Exponential Backoff
 * Provides robust retry mechanisms for external API calls
 */

import { logger } from './logger';

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
  retryableStatusCodes?: number[];
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN'],
};

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number
): number {
  // Exponential backoff: baseDelay * (multiplier ^ attempt)
  const exponentialDelay = baseDelayMs * Math.pow(backoffMultiplier, attempt);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter (±25%) to prevent thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);

  return Math.floor(cappedDelay + jitter);
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: any, options: RetryOptions): boolean {
  // Check for network errors
  if (error.code && options.retryableErrors?.includes(error.code)) {
    return true;
  }

  // Check for HTTP status codes
  if (error.response?.status && options.retryableStatusCodes?.includes(error.response.status)) {
    return true;
  }

  // Check for rate limiting
  if (error.message?.toLowerCase().includes('rate limit')) {
    return true;
  }

  // Check for timeout errors
  if (error.message?.toLowerCase().includes('timeout')) {
    return true;
  }

  // OpenAI specific errors
  if (error.message?.includes('Request failed') && error.message?.includes('500')) {
    return true;
  }

  return false;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const result = await fn();

      // Log success after retries
      if (attempt > 0) {
        logger.info(`Operation succeeded after ${attempt} retries`);
      }

      return result;
    } catch (error: any) {
      lastError = error;

      // Check if we've exhausted retries
      if (attempt >= opts.maxRetries) {
        logger.error(`Operation failed after ${opts.maxRetries} retries`, {
          error: error.message,
          attempts: attempt + 1,
        });
        break;
      }

      // Check if error is retryable
      if (!isRetryableError(error, opts)) {
        logger.warn('Non-retryable error encountered', {
          error: error.message,
          code: error.code,
          statusCode: error.response?.status,
        });
        throw error;
      }

      // Calculate delay for next attempt
      const delayMs = calculateDelay(
        attempt,
        opts.baseDelayMs,
        opts.maxDelayMs,
        opts.backoffMultiplier
      );

      // Log retry attempt
      logger.warn(`Retrying operation`, {
        attempt: attempt + 1,
        maxRetries: opts.maxRetries,
        delayMs,
        error: error.message,
      });

      // Call onRetry callback if provided
      if (opts.onRetry) {
        opts.onRetry(attempt + 1, error, delayMs);
      }

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Create a retry wrapper for a specific function
 */
export function createRetryWrapper<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: Partial<RetryOptions> = {}
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return withRetry(() => fn(...args), options);
  }) as T;
}

/**
 * Retry decorator for class methods
 */
export function Retry(options: Partial<RetryOptions> = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return withRetry(() => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}

/**
 * Circuit breaker state
 */
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

/**
 * Circuit breaker options
 */
export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenRequests: number;
}

const DEFAULT_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  halfOpenRequests: 1,
};

/**
 * Execute with circuit breaker pattern
 */
export async function withCircuitBreaker<T>(
  key: string,
  fn: () => Promise<T>,
  options: Partial<CircuitBreakerOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };

  // Get or create circuit breaker state
  if (!circuitBreakers.has(key)) {
    circuitBreakers.set(key, {
      failures: 0,
      lastFailureTime: 0,
      state: 'closed',
    });
  }

  const state = circuitBreakers.get(key)!;
  const now = Date.now();

  // Check if circuit is open
  if (state.state === 'open') {
    // Check if reset timeout has passed
    if (now - state.lastFailureTime >= opts.resetTimeoutMs) {
      state.state = 'half-open';
      logger.info(`Circuit breaker ${key} entering half-open state`);
    } else {
      throw new Error(`Circuit breaker ${key} is open. Request rejected.`);
    }
  }

  try {
    const result = await fn();

    // Reset on success
    if (state.state === 'half-open') {
      state.state = 'closed';
      state.failures = 0;
      logger.info(`Circuit breaker ${key} closed after successful request`);
    }

    return result;
  } catch (error) {
    state.failures++;
    state.lastFailureTime = now;

    if (state.failures >= opts.failureThreshold) {
      state.state = 'open';
      logger.error(`Circuit breaker ${key} opened after ${state.failures} failures`);
    }

    throw error;
  }
}

/**
 * Get circuit breaker status
 */
export function getCircuitBreakerStatus(key: string): CircuitBreakerState | undefined {
  return circuitBreakers.get(key);
}

/**
 * Reset circuit breaker
 */
export function resetCircuitBreaker(key: string): void {
  circuitBreakers.delete(key);
}

/**
 * Retry statistics tracking
 */
interface RetryStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalRetries: number;
  averageRetries: number;
}

const retryStats: Map<string, RetryStats> = new Map();

/**
 * Track retry statistics
 */
export function trackRetryStats(
  key: string,
  success: boolean,
  retries: number
): void {
  if (!retryStats.has(key)) {
    retryStats.set(key, {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalRetries: 0,
      averageRetries: 0,
    });
  }

  const stats = retryStats.get(key)!;
  stats.totalCalls++;
  stats.totalRetries += retries;

  if (success) {
    stats.successfulCalls++;
  } else {
    stats.failedCalls++;
  }

  stats.averageRetries = stats.totalRetries / stats.totalCalls;
}

/**
 * Get retry statistics
 */
export function getRetryStats(key?: string): Map<string, RetryStats> | RetryStats | undefined {
  if (key) {
    return retryStats.get(key);
  }
  return retryStats;
}

/**
 * Reset retry statistics
 */
export function resetRetryStats(key?: string): void {
  if (key) {
    retryStats.delete(key);
  } else {
    retryStats.clear();
  }
}

export default {
  withRetry,
  createRetryWrapper,
  Retry,
  withCircuitBreaker,
  getCircuitBreakerStatus,
  resetCircuitBreaker,
  calculateDelay,
  isRetryableError,
  trackRetryStats,
  getRetryStats,
  resetRetryStats,
};
