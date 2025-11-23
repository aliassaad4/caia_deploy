import {
  calculateCost,
  trackUsage,
  getUsageSummary,
  estimateCost,
  checkBudget
} from '../../utils/costTracking';

describe('Cost Tracking', () => {
  describe('calculateCost', () => {
    it('should calculate cost for gpt-4o', () => {
      const result = calculateCost('gpt-4o', 1000, 500);
      expect(result.inputCost).toBe(0.0025);
      expect(result.outputCost).toBe(0.005);
      expect(result.totalCost).toBe(0.0075);
    });

    it('should calculate cost for gpt-3.5-turbo', () => {
      const result = calculateCost('gpt-3.5-turbo', 1000, 1000);
      expect(result.inputCost).toBe(0.0005);
      expect(result.outputCost).toBe(0.0015);
      expect(result.totalCost).toBe(0.002);
    });

    it('should handle zero tokens', () => {
      const result = calculateCost('gpt-4o', 0, 0);
      expect(result.totalCost).toBe(0);
    });

    it('should default to gpt-4o pricing for unknown models', () => {
      const result = calculateCost('unknown-model', 1000, 500);
      expect(result.totalCost).toBe(0.0075); // Same as gpt-4o
    });
  });

  describe('trackUsage', () => {
    it('should track usage and return record', () => {
      const record = trackUsage(
        'gpt-4o',
        'test_operation',
        100,
        50,
        500,
        { userId: 'test-user' }
      );

      expect(record.model).toBe('gpt-4o');
      expect(record.operation).toBe('test_operation');
      expect(record.promptTokens).toBe(100);
      expect(record.completionTokens).toBe(50);
      expect(record.totalTokens).toBe(150);
      expect(record.latencyMs).toBe(500);
      expect(record.userId).toBe('test-user');
      expect(record.timestamp).toBeDefined();
    });

    it('should calculate costs correctly', () => {
      const record = trackUsage('gpt-4o', 'test', 1000, 500, 100);
      expect(record.inputCost).toBe(0.0025);
      expect(record.outputCost).toBe(0.005);
      expect(record.totalCost).toBe(0.0075);
    });
  });

  describe('getUsageSummary', () => {
    beforeEach(() => {
      // Track some test usage
      trackUsage('gpt-4o', 'chat', 100, 50, 100);
      trackUsage('gpt-4o', 'chat', 200, 100, 200);
      trackUsage('gpt-3.5-turbo', 'summary', 500, 250, 150);
    });

    it('should return summary with totals', () => {
      const summary = getUsageSummary();
      expect(summary.totalCalls).toBeGreaterThan(0);
      expect(summary.totalTokens).toBeGreaterThan(0);
      expect(summary.totalCost).toBeGreaterThan(0);
    });

    it('should group by model', () => {
      const summary = getUsageSummary();
      expect(summary.byModel).toBeDefined();
    });

    it('should group by operation', () => {
      const summary = getUsageSummary();
      expect(summary.byOperation).toBeDefined();
    });
  });

  describe('estimateCost', () => {
    it('should estimate cost based on prompt length', () => {
      const prompt = 'Hello world'; // ~11 chars = ~3 tokens
      const result = estimateCost('gpt-4o', prompt, 100);
      expect(result.estimatedPromptTokens).toBeGreaterThan(0);
      expect(result.estimatedCost).toBeGreaterThan(0);
    });

    it('should estimate higher cost for longer prompts', () => {
      const shortPrompt = 'Hi';
      const longPrompt = 'This is a much longer prompt with many more words and characters';

      const shortResult = estimateCost('gpt-4o', shortPrompt, 100);
      const longResult = estimateCost('gpt-4o', longPrompt, 100);

      expect(longResult.estimatedCost).toBeGreaterThan(shortResult.estimatedCost);
    });
  });

  describe('checkBudget', () => {
    it('should check against daily budget', () => {
      const result = checkBudget(10, 100);
      expect(result.withinDailyBudget).toBeDefined();
      expect(result.dailySpent).toBeDefined();
    });

    it('should check against monthly budget', () => {
      const result = checkBudget(10, 100);
      expect(result.withinMonthlyBudget).toBeDefined();
      expect(result.monthlySpent).toBeDefined();
    });

    it('should return true for high budgets', () => {
      const result = checkBudget(1000, 10000);
      expect(result.withinDailyBudget).toBe(true);
      expect(result.withinMonthlyBudget).toBe(true);
    });
  });
});
