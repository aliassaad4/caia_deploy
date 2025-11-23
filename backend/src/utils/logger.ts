/**
 * Structured Logging with Winston
 * Provides consistent, parseable logs for observability
 */

import winston from 'winston';
import * as path from 'path';

// Custom format for structured logging
const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'caia-clinic' },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? structuredFormat : consoleFormat,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'app.log'),
      format: structuredFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File transport for errors only
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      format: structuredFormat,
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

// Ensure log directory exists
import * as fs from 'fs';
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * Latency tracking for API operations
 */
export interface LatencyMetrics {
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

const latencyRecords: LatencyMetrics[] = [];

/**
 * Start tracking latency for an operation
 */
export function startLatencyTracking(operation: string, metadata?: Record<string, any>): LatencyMetrics {
  const metrics: LatencyMetrics = {
    operation,
    startTime: Date.now(),
    metadata,
  };
  return metrics;
}

/**
 * End latency tracking and log the result
 */
export function endLatencyTracking(metrics: LatencyMetrics): number {
  metrics.endTime = Date.now();
  metrics.duration = metrics.endTime - metrics.startTime;

  latencyRecords.push(metrics);

  // Keep only last 1000 records in memory
  if (latencyRecords.length > 1000) {
    latencyRecords.shift();
  }

  // Log the latency
  const logLevel = metrics.duration > 5000 ? 'warn' : 'info';
  logger.log(logLevel, `${metrics.operation} completed`, {
    duration: metrics.duration,
    ...metrics.metadata,
  });

  return metrics.duration;
}

/**
 * Get latency statistics
 */
export function getLatencyStats(operation?: string): {
  count: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
} {
  let records = latencyRecords.filter(r => r.duration !== undefined);

  if (operation) {
    records = records.filter(r => r.operation === operation);
  }

  if (records.length === 0) {
    return { count: 0, avgMs: 0, minMs: 0, maxMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 };
  }

  const durations = records.map(r => r.duration!).sort((a, b) => a - b);
  const sum = durations.reduce((a, b) => a + b, 0);

  return {
    count: durations.length,
    avgMs: Math.round(sum / durations.length),
    minMs: durations[0],
    maxMs: durations[durations.length - 1],
    p50Ms: durations[Math.floor(durations.length * 0.5)],
    p95Ms: durations[Math.floor(durations.length * 0.95)],
    p99Ms: durations[Math.floor(durations.length * 0.99)],
  };
}

/**
 * Log API request
 */
export function logApiRequest(req: {
  method: string;
  path: string;
  userId?: string;
  ip?: string;
}): void {
  logger.info('API Request', {
    type: 'api_request',
    method: req.method,
    path: req.path,
    userId: req.userId,
    ip: req.ip,
  });
}

/**
 * Log API response
 */
export function logApiResponse(res: {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  userId?: string;
}): void {
  const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
  logger.log(level, 'API Response', {
    type: 'api_response',
    method: res.method,
    path: res.path,
    statusCode: res.statusCode,
    duration: res.duration,
    userId: res.userId,
  });
}

/**
 * Log AI operation
 */
export function logAiOperation(op: {
  operation: string;
  model: string;
  tokens?: number;
  cost?: number;
  duration: number;
  userId?: string;
  success: boolean;
  error?: string;
}): void {
  const level = op.success ? 'info' : 'error';
  logger.log(level, `AI ${op.operation}`, {
    type: 'ai_operation',
    operation: op.operation,
    model: op.model,
    tokens: op.tokens,
    cost: op.cost,
    duration: op.duration,
    userId: op.userId,
    success: op.success,
    error: op.error,
  });
}

/**
 * Log security event
 */
export function logSecurityEvent(event: {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  details: Record<string, any>;
}): void {
  const level = event.severity === 'critical' ? 'error' :
                event.severity === 'high' ? 'warn' : 'info';
  logger.log(level, `Security: ${event.type}`, {
    type: 'security_event',
    eventType: event.type,
    severity: event.severity,
    userId: event.userId,
    ...event.details,
  });
}

/**
 * Log database operation
 */
export function logDbOperation(op: {
  operation: string;
  table: string;
  duration: number;
  success: boolean;
  error?: string;
}): void {
  const level = op.success ? 'debug' : 'error';
  logger.log(level, `DB ${op.operation}`, {
    type: 'db_operation',
    operation: op.operation,
    table: op.table,
    duration: op.duration,
    success: op.success,
    error: op.error,
  });
}

/**
 * Log application event
 */
export function logAppEvent(event: string, data?: Record<string, any>): void {
  logger.info(event, { type: 'app_event', ...data });
}

/**
 * Log error with stack trace
 */
export function logError(message: string, error: Error, context?: Record<string, any>): void {
  logger.error(message, {
    type: 'error',
    errorName: error.name,
    errorMessage: error.message,
    stack: error.stack,
    ...context,
  });
}

// Export the logger for direct use
export { logger };

export default {
  logger,
  startLatencyTracking,
  endLatencyTracking,
  getLatencyStats,
  logApiRequest,
  logApiResponse,
  logAiOperation,
  logSecurityEvent,
  logDbOperation,
  logAppEvent,
  logError,
};
