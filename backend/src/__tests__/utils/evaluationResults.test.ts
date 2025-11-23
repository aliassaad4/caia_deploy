/**
 * Tests for Evaluation Results Documentation
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  startEvaluationRun,
  recordTestResult,
  generateSummary,
  endEvaluationRun,
  generateMarkdownReport,
  getCurrentResults,
  getCurrentRunId,
  analyzeTrends,
  EvaluationSummary,
} from '../../utils/evaluationResults';

describe('Evaluation Results', () => {
  const RESULTS_DIR = path.join(process.cwd(), 'evaluation_results');

  beforeEach(() => {
    // Start a fresh run for each test
    startEvaluationRun('test_run');
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(RESULTS_DIR)) {
      const files = fs.readdirSync(RESULTS_DIR).filter(f => f.startsWith('test_run'));
      files.forEach(f => {
        try {
          fs.unlinkSync(path.join(RESULTS_DIR, f));
        } catch (e) {
          // Ignore errors
        }
      });
    }
  });

  describe('startEvaluationRun', () => {
    it('should generate unique run ID', () => {
      const runId = startEvaluationRun();
      expect(runId).toMatch(/^eval_\d+_[a-z0-9]+$/);
    });

    it('should use provided run ID', () => {
      const runId = startEvaluationRun('custom_run_123');
      expect(runId).toBe('custom_run_123');
    });

    it('should set current run ID', () => {
      startEvaluationRun('my_run');
      expect(getCurrentRunId()).toBe('my_run');
    });

    it('should clear previous results', () => {
      recordTestResult({
        id: 'test1',
        name: 'Test 1',
        category: 'general',
        input: 'input',
        actualOutput: 'output',
        passed: true,
        score: 100,
        latencyMs: 100,
      });

      startEvaluationRun('new_run');
      expect(getCurrentResults().length).toBe(0);
    });
  });

  describe('recordTestResult', () => {
    it('should record test result', () => {
      recordTestResult({
        id: 'test1',
        name: 'Test 1',
        category: 'general',
        input: 'test input',
        actualOutput: 'test output',
        passed: true,
        score: 95,
        latencyMs: 150,
      });

      const results = getCurrentResults();
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('test1');
      expect(results[0].passed).toBe(true);
    });

    it('should add timestamp', () => {
      recordTestResult({
        id: 'test1',
        name: 'Test 1',
        category: 'general',
        input: 'input',
        actualOutput: 'output',
        passed: true,
        score: 100,
        latencyMs: 100,
      });

      const results = getCurrentResults();
      expect(results[0].timestamp).toBeDefined();
      expect(results[0].timestamp instanceof Date).toBe(true);
    });

    it('should record token usage', () => {
      recordTestResult({
        id: 'test1',
        name: 'Test 1',
        category: 'general',
        input: 'input',
        actualOutput: 'output',
        passed: true,
        score: 100,
        latencyMs: 100,
        tokenUsage: {
          prompt: 50,
          completion: 100,
          total: 150,
        },
      });

      const results = getCurrentResults();
      expect(results[0].tokenUsage?.total).toBe(150);
    });
  });

  describe('generateSummary', () => {
    beforeEach(() => {
      // Add sample test results
      recordTestResult({
        id: 'test1',
        name: 'Booking Test',
        category: 'booking',
        input: 'Book appointment',
        actualOutput: 'Appointment booked',
        passed: true,
        score: 90,
        latencyMs: 200,
        tokenUsage: { prompt: 50, completion: 100, total: 150 },
      });

      recordTestResult({
        id: 'test2',
        name: 'Safety Test',
        category: 'safety',
        input: 'Emergency question',
        actualOutput: 'Call 911',
        passed: true,
        score: 100,
        latencyMs: 150,
        tokenUsage: { prompt: 30, completion: 50, total: 80 },
      });

      recordTestResult({
        id: 'test3',
        name: 'Edge Case',
        category: 'booking',
        input: 'Invalid input',
        actualOutput: 'Error',
        passed: false,
        score: 40,
        latencyMs: 300,
        tokenUsage: { prompt: 40, completion: 60, total: 100 },
      });
    });

    it('should calculate pass rate', () => {
      const summary = generateSummary();
      expect(summary.passRate).toBeCloseTo(66.67, 1);
      expect(summary.passedTests).toBe(2);
      expect(summary.failedTests).toBe(1);
    });

    it('should calculate average score', () => {
      const summary = generateSummary();
      expect(summary.averageScore).toBeCloseTo(76.67, 1);
    });

    it('should calculate average latency', () => {
      const summary = generateSummary();
      expect(summary.averageLatency).toBeCloseTo(216.67, 0);
    });

    it('should sum total tokens', () => {
      const summary = generateSummary();
      expect(summary.totalTokens).toBe(330);
    });

    it('should estimate cost', () => {
      const summary = generateSummary();
      expect(summary.estimatedCost).toBeCloseTo(0.0033, 4);
    });

    it('should group by category', () => {
      const summary = generateSummary();

      expect(summary.byCategory.booking).toBeDefined();
      expect(summary.byCategory.booking.total).toBe(2);
      expect(summary.byCategory.booking.passed).toBe(1);

      expect(summary.byCategory.safety).toBeDefined();
      expect(summary.byCategory.safety.total).toBe(1);
      expect(summary.byCategory.safety.passed).toBe(1);
    });

    it('should generate metrics', () => {
      const summary = generateSummary();

      expect(summary.metrics.length).toBeGreaterThan(0);
      expect(summary.metrics.some(m => m.name === 'Pass Rate')).toBe(true);
      expect(summary.metrics.some(m => m.name === 'Average Latency')).toBe(true);
    });

    it('should generate benchmarks', () => {
      const summary = generateSummary();

      expect(summary.benchmarks.length).toBeGreaterThan(0);
      expect(summary.benchmarks.some(b => b.name.includes('Response Time'))).toBe(true);
      expect(summary.benchmarks.some(b => b.name.includes('Accuracy'))).toBe(true);
    });

    it('should include run ID and timestamp', () => {
      const summary = generateSummary();

      expect(summary.runId).toBe('test_run');
      expect(summary.timestamp).toBeDefined();
      expect(summary.duration).toBeGreaterThan(0);
    });
  });

  describe('endEvaluationRun', () => {
    beforeEach(() => {
      recordTestResult({
        id: 'test1',
        name: 'Test 1',
        category: 'general',
        input: 'input',
        actualOutput: 'output',
        passed: true,
        score: 100,
        latencyMs: 100,
      });
    });

    it('should return summary', () => {
      const summary = endEvaluationRun();
      expect(summary.totalTests).toBe(1);
      expect(summary.passedTests).toBe(1);
    });

    it('should save results to file', () => {
      endEvaluationRun();

      const resultsFile = path.join(RESULTS_DIR, 'test_run.json');
      expect(fs.existsSync(resultsFile)).toBe(true);
    });

    it('should reset state after ending', () => {
      endEvaluationRun();

      expect(getCurrentRunId()).toBeNull();
      expect(getCurrentResults().length).toBe(0);
    });
  });

  describe('generateMarkdownReport', () => {
    let summary: EvaluationSummary;

    beforeEach(() => {
      recordTestResult({
        id: 'test1',
        name: 'Test 1',
        category: 'booking',
        input: 'input',
        actualOutput: 'output',
        passed: true,
        score: 90,
        latencyMs: 200,
        tokenUsage: { prompt: 50, completion: 100, total: 150 },
      });

      recordTestResult({
        id: 'test2',
        name: 'Test 2',
        category: 'safety',
        input: 'input',
        actualOutput: 'output',
        passed: false,
        score: 40,
        latencyMs: 500,
      });

      summary = generateSummary();
    });

    it('should generate markdown with header', () => {
      const report = generateMarkdownReport(summary);
      expect(report).toContain('# AI Evaluation Report');
    });

    it('should include run information', () => {
      const report = generateMarkdownReport(summary);
      expect(report).toContain('test_run');
      expect(report).toContain('Duration');
    });

    it('should include executive summary table', () => {
      const report = generateMarkdownReport(summary);
      expect(report).toContain('| Metric | Value |');
      expect(report).toContain('Total Tests');
      expect(report).toContain('Pass Rate');
    });

    it('should include benchmarks section', () => {
      const report = generateMarkdownReport(summary);
      expect(report).toContain('## Performance Benchmarks');
      expect(report).toContain('Target');
      expect(report).toContain('Actual');
    });

    it('should include category breakdown', () => {
      const report = generateMarkdownReport(summary);
      expect(report).toContain('## Results by Category');
      expect(report).toContain('booking');
      expect(report).toContain('safety');
    });

    it('should include recommendations', () => {
      const report = generateMarkdownReport(summary);
      expect(report).toContain('## Recommendations');
    });

    it('should mark passed/failed benchmarks', () => {
      const report = generateMarkdownReport(summary);
      expect(report).toMatch(/PASS|FAIL/);
    });
  });

  describe('analyzeTrends', () => {
    it('should return stable for single result', () => {
      const results: EvaluationSummary[] = [
        {
          runId: 'run1',
          timestamp: new Date(),
          duration: 1000,
          totalTests: 10,
          passedTests: 8,
          failedTests: 2,
          passRate: 80,
          averageScore: 75,
          averageLatency: 200,
          totalTokens: 1000,
          estimatedCost: 0.01,
          byCategory: {},
          metrics: [],
          benchmarks: [],
        },
      ];

      const trends = analyzeTrends(results);

      expect(trends.passRateTrend).toBe('stable');
      expect(trends.latencyTrend).toBe('stable');
      expect(trends.scoreTrend).toBe('stable');
    });

    it('should detect improving pass rate', () => {
      const results: EvaluationSummary[] = [
        { passRate: 90, averageLatency: 200, averageScore: 85 } as EvaluationSummary,
        { passRate: 85, averageLatency: 210, averageScore: 80 } as EvaluationSummary,
        { passRate: 80, averageLatency: 220, averageScore: 75 } as EvaluationSummary,
        { passRate: 70, averageLatency: 250, averageScore: 65 } as EvaluationSummary,
        { passRate: 60, averageLatency: 300, averageScore: 55 } as EvaluationSummary,
        { passRate: 50, averageLatency: 350, averageScore: 45 } as EvaluationSummary,
      ];

      const trends = analyzeTrends(results);

      expect(trends.passRateTrend).toBe('improving');
    });

    it('should detect declining latency (which is improving)', () => {
      const results: EvaluationSummary[] = [
        { passRate: 80, averageLatency: 100, averageScore: 80 } as EvaluationSummary,
        { passRate: 80, averageLatency: 150, averageScore: 80 } as EvaluationSummary,
        { passRate: 80, averageLatency: 200, averageScore: 80 } as EvaluationSummary,
        { passRate: 80, averageLatency: 300, averageScore: 80 } as EvaluationSummary,
        { passRate: 80, averageLatency: 400, averageScore: 80 } as EvaluationSummary,
        { passRate: 80, averageLatency: 500, averageScore: 80 } as EvaluationSummary,
      ];

      const trends = analyzeTrends(results);

      // Lower latency is better, so going from 500 -> 100 is improving
      expect(trends.latencyTrend).toBe('improving');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero tests', () => {
      // Start run without recording any tests
      startEvaluationRun('empty_run');

      expect(() => generateSummary()).not.toThrow();
    });

    it('should handle all passed tests', () => {
      recordTestResult({
        id: 'test1',
        name: 'Test 1',
        category: 'general',
        input: 'input',
        actualOutput: 'output',
        passed: true,
        score: 100,
        latencyMs: 100,
      });

      const summary = generateSummary();
      expect(summary.passRate).toBe(100);
    });

    it('should handle all failed tests', () => {
      recordTestResult({
        id: 'test1',
        name: 'Test 1',
        category: 'general',
        input: 'input',
        actualOutput: 'output',
        passed: false,
        score: 0,
        latencyMs: 100,
      });

      const summary = generateSummary();
      expect(summary.passRate).toBe(0);
    });

    it('should handle missing token usage', () => {
      recordTestResult({
        id: 'test1',
        name: 'Test 1',
        category: 'general',
        input: 'input',
        actualOutput: 'output',
        passed: true,
        score: 100,
        latencyMs: 100,
        // No tokenUsage
      });

      const summary = generateSummary();
      expect(summary.totalTokens).toBe(0);
    });
  });
});
