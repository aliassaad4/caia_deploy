/**
 * Cost Tracking Utility
 * Tracks token usage and costs for AI API calls
 */

import * as fs from 'fs';
import * as path from 'path';

// Pricing per 1K tokens (as of 2024)
const PRICING = {
  'gpt-4o': {
    input: 0.0025, // $2.50 per 1M tokens
    output: 0.01,   // $10 per 1M tokens
  },
  'gpt-4-turbo': {
    input: 0.01,
    output: 0.03,
  },
  'gpt-4': {
    input: 0.03,
    output: 0.06,
  },
  'gpt-3.5-turbo': {
    input: 0.0005,
    output: 0.0015,
  },
};

export interface UsageRecord {
  timestamp: string;
  model: string;
  operation: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  latencyMs: number;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface UsageSummary {
  totalCalls: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCost: number;
  averageLatency: number;
  byModel: Record<string, {
    calls: number;
    tokens: number;
    cost: number;
  }>;
  byOperation: Record<string, {
    calls: number;
    tokens: number;
    cost: number;
  }>;
  byDay: Record<string, {
    calls: number;
    tokens: number;
    cost: number;
  }>;
}

// In-memory store for current session
const usageRecords: UsageRecord[] = [];

// File path for persistent storage
const COST_LOG_PATH = path.join(process.cwd(), 'cost_log.csv');

/**
 * Calculate cost for token usage
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): { inputCost: number; outputCost: number; totalCost: number } {
  const pricing = PRICING[model as keyof typeof PRICING] || PRICING['gpt-4o'];

  const inputCost = (promptTokens / 1000) * pricing.input;
  const outputCost = (completionTokens / 1000) * pricing.output;
  const totalCost = inputCost + outputCost;

  return {
    inputCost: Math.round(inputCost * 1000000) / 1000000, // 6 decimal places
    outputCost: Math.round(outputCost * 1000000) / 1000000,
    totalCost: Math.round(totalCost * 1000000) / 1000000,
  };
}

/**
 * Track API usage
 */
export function trackUsage(
  model: string,
  operation: string,
  promptTokens: number,
  completionTokens: number,
  latencyMs: number,
  options?: {
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, any>;
  }
): UsageRecord {
  const costs = calculateCost(model, promptTokens, completionTokens);

  const record: UsageRecord = {
    timestamp: new Date().toISOString(),
    model,
    operation,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    inputCost: costs.inputCost,
    outputCost: costs.outputCost,
    totalCost: costs.totalCost,
    latencyMs,
    userId: options?.userId,
    sessionId: options?.sessionId,
    metadata: options?.metadata,
  };

  // Store in memory
  usageRecords.push(record);

  // Append to CSV file
  appendToCostLog(record);

  // Log to console
  console.log(`[Cost Tracking] ${operation}: ${record.totalTokens} tokens, $${record.totalCost.toFixed(6)}, ${latencyMs}ms`);

  return record;
}

/**
 * Append record to CSV log file
 */
function appendToCostLog(record: UsageRecord): void {
  try {
    const fileExists = fs.existsSync(COST_LOG_PATH);

    // Create header if file doesn't exist
    if (!fileExists) {
      const header = [
        'timestamp',
        'model',
        'operation',
        'prompt_tokens',
        'completion_tokens',
        'total_tokens',
        'input_cost',
        'output_cost',
        'total_cost',
        'latency_ms',
        'user_id',
        'session_id',
      ].join(',') + '\n';
      fs.writeFileSync(COST_LOG_PATH, header);
    }

    // Append record
    const row = [
      record.timestamp,
      record.model,
      record.operation,
      record.promptTokens,
      record.completionTokens,
      record.totalTokens,
      record.inputCost,
      record.outputCost,
      record.totalCost,
      record.latencyMs,
      record.userId || '',
      record.sessionId || '',
    ].join(',') + '\n';

    fs.appendFileSync(COST_LOG_PATH, row);
  } catch (error) {
    console.error('[Cost Tracking] Failed to write to cost log:', error);
  }
}

/**
 * Get usage summary for a time period
 */
export function getUsageSummary(
  startDate?: Date,
  endDate?: Date
): UsageSummary {
  let records = usageRecords;

  // Filter by date range if provided
  if (startDate || endDate) {
    records = records.filter(r => {
      const date = new Date(r.timestamp);
      if (startDate && date < startDate) return false;
      if (endDate && date > endDate) return false;
      return true;
    });
  }

  const summary: UsageSummary = {
    totalCalls: records.length,
    totalTokens: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCost: 0,
    averageLatency: 0,
    byModel: {},
    byOperation: {},
    byDay: {},
  };

  let totalLatency = 0;

  for (const record of records) {
    summary.totalTokens += record.totalTokens;
    summary.totalPromptTokens += record.promptTokens;
    summary.totalCompletionTokens += record.completionTokens;
    summary.totalCost += record.totalCost;
    totalLatency += record.latencyMs;

    // By model
    if (!summary.byModel[record.model]) {
      summary.byModel[record.model] = { calls: 0, tokens: 0, cost: 0 };
    }
    summary.byModel[record.model].calls++;
    summary.byModel[record.model].tokens += record.totalTokens;
    summary.byModel[record.model].cost += record.totalCost;

    // By operation
    if (!summary.byOperation[record.operation]) {
      summary.byOperation[record.operation] = { calls: 0, tokens: 0, cost: 0 };
    }
    summary.byOperation[record.operation].calls++;
    summary.byOperation[record.operation].tokens += record.totalTokens;
    summary.byOperation[record.operation].cost += record.totalCost;

    // By day
    const day = record.timestamp.split('T')[0];
    if (!summary.byDay[day]) {
      summary.byDay[day] = { calls: 0, tokens: 0, cost: 0 };
    }
    summary.byDay[day].calls++;
    summary.byDay[day].tokens += record.totalTokens;
    summary.byDay[day].cost += record.totalCost;
  }

  summary.averageLatency = records.length > 0 ? totalLatency / records.length : 0;
  summary.totalCost = Math.round(summary.totalCost * 1000000) / 1000000;

  return summary;
}

/**
 * Get recent usage records
 */
export function getRecentUsage(limit: number = 100): UsageRecord[] {
  return usageRecords.slice(-limit);
}

/**
 * Estimate cost for a prompt before sending
 */
export function estimateCost(
  model: string,
  promptText: string,
  estimatedCompletionTokens: number = 500
): { estimatedPromptTokens: number; estimatedCost: number } {
  // Rough estimation: ~4 characters per token for English
  const estimatedPromptTokens = Math.ceil(promptText.length / 4);
  const costs = calculateCost(model, estimatedPromptTokens, estimatedCompletionTokens);

  return {
    estimatedPromptTokens,
    estimatedCost: costs.totalCost,
  };
}

/**
 * Check if usage is within budget
 */
export function checkBudget(
  dailyBudget: number,
  monthlyBudget: number
): { withinDailyBudget: boolean; withinMonthlyBudget: boolean; dailySpent: number; monthlySpent: number } {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const dailySummary = getUsageSummary(startOfDay);
  const monthlySummary = getUsageSummary(startOfMonth);

  return {
    withinDailyBudget: dailySummary.totalCost < dailyBudget,
    withinMonthlyBudget: monthlySummary.totalCost < monthlyBudget,
    dailySpent: dailySummary.totalCost,
    monthlySpent: monthlySummary.totalCost,
  };
}

/**
 * Format usage summary for display
 */
export function formatUsageSummary(summary: UsageSummary): string {
  let output = '\n=== AI Usage Summary ===\n';
  output += `Total Calls: ${summary.totalCalls}\n`;
  output += `Total Tokens: ${summary.totalTokens.toLocaleString()}\n`;
  output += `  - Prompt: ${summary.totalPromptTokens.toLocaleString()}\n`;
  output += `  - Completion: ${summary.totalCompletionTokens.toLocaleString()}\n`;
  output += `Total Cost: $${summary.totalCost.toFixed(4)}\n`;
  output += `Average Latency: ${Math.round(summary.averageLatency)}ms\n`;

  output += '\nBy Model:\n';
  for (const [model, data] of Object.entries(summary.byModel)) {
    output += `  ${model}: ${data.calls} calls, ${data.tokens.toLocaleString()} tokens, $${data.cost.toFixed(4)}\n`;
  }

  output += '\nBy Operation:\n';
  for (const [op, data] of Object.entries(summary.byOperation)) {
    output += `  ${op}: ${data.calls} calls, ${data.tokens.toLocaleString()} tokens, $${data.cost.toFixed(4)}\n`;
  }

  return output;
}

export default {
  trackUsage,
  calculateCost,
  getUsageSummary,
  getRecentUsage,
  estimateCost,
  checkBudget,
  formatUsageSummary,
};
