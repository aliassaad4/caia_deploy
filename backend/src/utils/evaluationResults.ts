/**
 * Evaluation Results Documentation
 * Tracks accuracy metrics and performance benchmarks for AI responses
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

// ==================== Types ====================

export interface EvaluationMetric {
  name: string;
  value: number;
  unit: string;
  threshold?: number;
  passed?: boolean;
}

export interface TestCaseResult {
  id: string;
  name: string;
  category: string;
  input: string;
  expectedOutput?: string;
  actualOutput: string;
  passed: boolean;
  score: number;
  latencyMs: number;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface EvaluationSummary {
  runId: string;
  timestamp: Date;
  duration: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  passRate: number;
  averageScore: number;
  averageLatency: number;
  totalTokens: number;
  estimatedCost: number;
  byCategory: Record<string, CategorySummary>;
  metrics: EvaluationMetric[];
  benchmarks: BenchmarkResult[];
}

export interface CategorySummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  averageScore: number;
  averageLatency: number;
}

export interface BenchmarkResult {
  name: string;
  target: number;
  actual: number;
  unit: string;
  passed: boolean;
  percentOfTarget: number;
}

export interface PerformanceBenchmarks {
  responseTimeP50: number;
  responseTimeP95: number;
  responseTimeP99: number;
  throughput: number;
  errorRate: number;
  availability: number;
}

// ==================== Evaluation Storage ====================

const RESULTS_DIR = path.join(process.cwd(), 'evaluation_results');

/**
 * Ensure results directory exists
 */
function ensureResultsDir(): void {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }
}

// ==================== Test Case Tracking ====================

const currentRunResults: TestCaseResult[] = [];
let currentRunId: string | null = null;
let runStartTime: number | null = null;

/**
 * Start a new evaluation run
 */
export function startEvaluationRun(runId?: string): string {
  currentRunId = runId || `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  runStartTime = Date.now();
  currentRunResults.length = 0;

  logger.info(`Started evaluation run: ${currentRunId}`);
  return currentRunId;
}

/**
 * Record a test case result
 */
export function recordTestResult(result: Omit<TestCaseResult, 'timestamp'>): void {
  const fullResult: TestCaseResult = {
    ...result,
    timestamp: new Date(),
  };

  currentRunResults.push(fullResult);

  logger.info(`Test case ${result.id}: ${result.passed ? 'PASSED' : 'FAILED'}`, {
    category: result.category,
    score: result.score,
    latencyMs: result.latencyMs,
  });
}

/**
 * Calculate percentile from sorted array
 */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Generate evaluation summary
 */
export function generateSummary(): EvaluationSummary {
  if (!currentRunId || !runStartTime) {
    throw new Error('No evaluation run in progress');
  }

  const duration = Date.now() - runStartTime;
  const passedTests = currentRunResults.filter(r => r.passed).length;
  const totalScore = currentRunResults.reduce((sum, r) => sum + r.score, 0);
  const totalLatency = currentRunResults.reduce((sum, r) => sum + r.latencyMs, 0);
  const totalTokens = currentRunResults.reduce(
    (sum, r) => sum + (r.tokenUsage?.total || 0),
    0
  );

  // Calculate by category
  const byCategory: Record<string, CategorySummary> = {};
  for (const result of currentRunResults) {
    if (!byCategory[result.category]) {
      byCategory[result.category] = {
        total: 0,
        passed: 0,
        failed: 0,
        passRate: 0,
        averageScore: 0,
        averageLatency: 0,
      };
    }

    const cat = byCategory[result.category];
    cat.total++;
    if (result.passed) cat.passed++;
    else cat.failed++;
  }

  // Calculate category averages
  for (const category of Object.keys(byCategory)) {
    const catResults = currentRunResults.filter(r => r.category === category);
    const cat = byCategory[category];
    cat.passRate = (cat.passed / cat.total) * 100;
    cat.averageScore = catResults.reduce((sum, r) => sum + r.score, 0) / catResults.length;
    cat.averageLatency = catResults.reduce((sum, r) => sum + r.latencyMs, 0) / catResults.length;
  }

  // Calculate latency percentiles
  const latencies = currentRunResults.map(r => r.latencyMs);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);

  // Generate metrics
  const metrics: EvaluationMetric[] = [
    { name: 'Pass Rate', value: (passedTests / currentRunResults.length) * 100, unit: '%', threshold: 80 },
    { name: 'Average Score', value: totalScore / currentRunResults.length, unit: 'points', threshold: 70 },
    { name: 'Average Latency', value: totalLatency / currentRunResults.length, unit: 'ms', threshold: 3000 },
    { name: 'P50 Latency', value: p50, unit: 'ms', threshold: 2000 },
    { name: 'P95 Latency', value: p95, unit: 'ms', threshold: 5000 },
    { name: 'P99 Latency', value: p99, unit: 'ms', threshold: 10000 },
    { name: 'Total Tokens Used', value: totalTokens, unit: 'tokens' },
    { name: 'Estimated Cost', value: (totalTokens / 1000) * 0.01, unit: 'USD' },
  ];

  // Mark passed/failed for metrics with thresholds
  for (const metric of metrics) {
    if (metric.threshold !== undefined) {
      if (metric.name.includes('Latency')) {
        metric.passed = metric.value <= metric.threshold;
      } else {
        metric.passed = metric.value >= metric.threshold;
      }
    }
  }

  // Generate benchmarks
  const benchmarks: BenchmarkResult[] = [
    {
      name: 'Response Time (P95)',
      target: 5000,
      actual: p95,
      unit: 'ms',
      passed: p95 <= 5000,
      percentOfTarget: (p95 / 5000) * 100,
    },
    {
      name: 'Accuracy Rate',
      target: 80,
      actual: (passedTests / currentRunResults.length) * 100,
      unit: '%',
      passed: (passedTests / currentRunResults.length) * 100 >= 80,
      percentOfTarget: ((passedTests / currentRunResults.length) * 100) / 80 * 100,
    },
    {
      name: 'Average Quality Score',
      target: 70,
      actual: totalScore / currentRunResults.length,
      unit: 'points',
      passed: totalScore / currentRunResults.length >= 70,
      percentOfTarget: (totalScore / currentRunResults.length) / 70 * 100,
    },
  ];

  const summary: EvaluationSummary = {
    runId: currentRunId,
    timestamp: new Date(),
    duration,
    totalTests: currentRunResults.length,
    passedTests,
    failedTests: currentRunResults.length - passedTests,
    passRate: (passedTests / currentRunResults.length) * 100,
    averageScore: totalScore / currentRunResults.length,
    averageLatency: totalLatency / currentRunResults.length,
    totalTokens,
    estimatedCost: (totalTokens / 1000) * 0.01,
    byCategory,
    metrics,
    benchmarks,
  };

  return summary;
}

/**
 * End evaluation run and save results
 */
export function endEvaluationRun(): EvaluationSummary {
  const summary = generateSummary();

  // Save results to file
  ensureResultsDir();

  const resultsFile = path.join(RESULTS_DIR, `${currentRunId}.json`);
  const results = {
    summary,
    testCases: currentRunResults,
  };

  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));

  logger.info(`Evaluation run completed: ${currentRunId}`, {
    passRate: summary.passRate,
    averageScore: summary.averageScore,
    duration: summary.duration,
    resultsFile,
  });

  // Reset state
  currentRunId = null;
  runStartTime = null;
  currentRunResults.length = 0;

  return summary;
}

// ==================== Report Generation ====================

/**
 * Generate markdown report
 */
export function generateMarkdownReport(summary: EvaluationSummary): string {
  const lines: string[] = [];

  lines.push('# AI Evaluation Report');
  lines.push('');
  lines.push(`**Run ID:** ${summary.runId}`);
  lines.push(`**Date:** ${summary.timestamp.toISOString()}`);
  lines.push(`**Duration:** ${(summary.duration / 1000).toFixed(2)}s`);
  lines.push('');

  // Executive Summary
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Tests | ${summary.totalTests} |`);
  lines.push(`| Passed | ${summary.passedTests} |`);
  lines.push(`| Failed | ${summary.failedTests} |`);
  lines.push(`| Pass Rate | ${summary.passRate.toFixed(1)}% |`);
  lines.push(`| Average Score | ${summary.averageScore.toFixed(1)} |`);
  lines.push(`| Average Latency | ${summary.averageLatency.toFixed(0)}ms |`);
  lines.push(`| Total Tokens | ${summary.totalTokens} |`);
  lines.push(`| Estimated Cost | $${summary.estimatedCost.toFixed(4)} |`);
  lines.push('');

  // Benchmarks
  lines.push('## Performance Benchmarks');
  lines.push('');
  lines.push(`| Benchmark | Target | Actual | Status |`);
  lines.push(`|-----------|--------|--------|--------|`);
  for (const benchmark of summary.benchmarks) {
    const status = benchmark.passed ? ':white_check_mark: PASS' : ':x: FAIL';
    lines.push(
      `| ${benchmark.name} | ${benchmark.target}${benchmark.unit} | ${benchmark.actual.toFixed(1)}${benchmark.unit} | ${status} |`
    );
  }
  lines.push('');

  // Results by Category
  lines.push('## Results by Category');
  lines.push('');
  lines.push(`| Category | Total | Passed | Failed | Pass Rate | Avg Score | Avg Latency |`);
  lines.push(`|----------|-------|--------|--------|-----------|-----------|-------------|`);
  for (const [category, data] of Object.entries(summary.byCategory)) {
    lines.push(
      `| ${category} | ${data.total} | ${data.passed} | ${data.failed} | ${data.passRate.toFixed(1)}% | ${data.averageScore.toFixed(1)} | ${data.averageLatency.toFixed(0)}ms |`
    );
  }
  lines.push('');

  // Detailed Metrics
  lines.push('## Detailed Metrics');
  lines.push('');
  lines.push(`| Metric | Value | Threshold | Status |`);
  lines.push(`|--------|-------|-----------|--------|`);
  for (const metric of summary.metrics) {
    const threshold = metric.threshold !== undefined ? `${metric.threshold}${metric.unit}` : '-';
    const status = metric.passed === undefined ? '-' : metric.passed ? ':white_check_mark:' : ':x:';
    lines.push(
      `| ${metric.name} | ${metric.value.toFixed(2)}${metric.unit} | ${threshold} | ${status} |`
    );
  }
  lines.push('');

  // Recommendations
  lines.push('## Recommendations');
  lines.push('');
  if (summary.passRate < 80) {
    lines.push('- :warning: Pass rate below 80%. Review failing test cases.');
  }
  if (summary.averageLatency > 3000) {
    lines.push('- :warning: Average latency exceeds 3s. Consider optimization.');
  }
  const failedBenchmarks = summary.benchmarks.filter(b => !b.passed);
  for (const benchmark of failedBenchmarks) {
    lines.push(`- :x: ${benchmark.name} failed. Target: ${benchmark.target}, Actual: ${benchmark.actual.toFixed(1)}`);
  }
  if (failedBenchmarks.length === 0 && summary.passRate >= 80) {
    lines.push('- :white_check_mark: All benchmarks passed. System performing well.');
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Save markdown report
 */
export function saveMarkdownReport(summary: EvaluationSummary): string {
  ensureResultsDir();
  const report = generateMarkdownReport(summary);
  const reportFile = path.join(RESULTS_DIR, `${summary.runId}_report.md`);
  fs.writeFileSync(reportFile, report);
  return reportFile;
}

// ==================== Historical Analysis ====================

/**
 * Load historical evaluation results
 */
export function loadHistoricalResults(limit: number = 10): EvaluationSummary[] {
  ensureResultsDir();

  const files = fs.readdirSync(RESULTS_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('_report'))
    .sort()
    .reverse()
    .slice(0, limit);

  const results: EvaluationSummary[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(RESULTS_DIR, file), 'utf-8');
      const data = JSON.parse(content);
      results.push(data.summary);
    } catch (error) {
      logger.warn(`Failed to load evaluation result: ${file}`);
    }
  }

  return results;
}

/**
 * Calculate trend analysis
 */
export function analyzeTrends(results: EvaluationSummary[]): {
  passRateTrend: 'improving' | 'declining' | 'stable';
  latencyTrend: 'improving' | 'declining' | 'stable';
  scoreTrend: 'improving' | 'declining' | 'stable';
} {
  if (results.length < 2) {
    return {
      passRateTrend: 'stable',
      latencyTrend: 'stable',
      scoreTrend: 'stable',
    };
  }

  const recentPassRate = results.slice(0, 3).reduce((s, r) => s + r.passRate, 0) / 3;
  const olderPassRate = results.slice(-3).reduce((s, r) => s + r.passRate, 0) / 3;

  const recentLatency = results.slice(0, 3).reduce((s, r) => s + r.averageLatency, 0) / 3;
  const olderLatency = results.slice(-3).reduce((s, r) => s + r.averageLatency, 0) / 3;

  const recentScore = results.slice(0, 3).reduce((s, r) => s + r.averageScore, 0) / 3;
  const olderScore = results.slice(-3).reduce((s, r) => s + r.averageScore, 0) / 3;

  const getTrend = (recent: number, older: number, higherIsBetter: boolean): 'improving' | 'declining' | 'stable' => {
    const diff = ((recent - older) / older) * 100;
    if (Math.abs(diff) < 5) return 'stable';
    if (higherIsBetter) {
      return diff > 0 ? 'improving' : 'declining';
    }
    return diff < 0 ? 'improving' : 'declining';
  };

  return {
    passRateTrend: getTrend(recentPassRate, olderPassRate, true),
    latencyTrend: getTrend(recentLatency, olderLatency, false),
    scoreTrend: getTrend(recentScore, olderScore, true),
  };
}

/**
 * Get current run results
 */
export function getCurrentResults(): TestCaseResult[] {
  return [...currentRunResults];
}

/**
 * Get current run ID
 */
export function getCurrentRunId(): string | null {
  return currentRunId;
}

export default {
  startEvaluationRun,
  recordTestResult,
  generateSummary,
  endEvaluationRun,
  generateMarkdownReport,
  saveMarkdownReport,
  loadHistoricalResults,
  analyzeTrends,
  getCurrentResults,
  getCurrentRunId,
};
