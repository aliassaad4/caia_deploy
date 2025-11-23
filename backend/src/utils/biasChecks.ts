/**
 * Bias Checks - Fairness Evaluation for AI Responses
 * Detects potential biases in AI-generated medical content
 */

import { logger } from './logger';

// ==================== Bias Categories ====================

export type BiasCategory =
  | 'gender'
  | 'age'
  | 'race_ethnicity'
  | 'socioeconomic'
  | 'disability'
  | 'religion'
  | 'language'
  | 'weight';

export interface BiasIndicator {
  category: BiasCategory;
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

// ==================== Bias Patterns ====================

const BIAS_INDICATORS: BiasIndicator[] = [
  // Gender bias patterns
  {
    category: 'gender',
    pattern: /\b(hysterical|emotional|dramatic)\b.*\b(woman|female|she|her)\b/i,
    severity: 'high',
    description: 'Dismissive language associating emotions with gender',
  },
  {
    category: 'gender',
    pattern: /\b(man up|be a man|boys don't cry)\b/i,
    severity: 'medium',
    description: 'Gender-stereotyping language',
  },
  {
    category: 'gender',
    pattern: /\b(typical (female|male)|just like a (woman|man))\b/i,
    severity: 'medium',
    description: 'Gender generalizations',
  },

  // Age bias patterns
  {
    category: 'age',
    pattern: /\b(too old|at your age|elderly.*can't|senile)\b/i,
    severity: 'high',
    description: 'Ageist assumptions about capabilities',
  },
  {
    category: 'age',
    pattern: /\b(young people.*don't understand|kids these days)\b/i,
    severity: 'medium',
    description: 'Age-based generalizations',
  },
  {
    category: 'age',
    pattern: /\b(act your age|too young to)\b/i,
    severity: 'low',
    description: 'Age-based assumptions',
  },

  // Race/ethnicity bias patterns
  {
    category: 'race_ethnicity',
    pattern: /\b(your people|those people|you all)\b/i,
    severity: 'high',
    description: 'Othering language',
  },
  {
    category: 'race_ethnicity',
    pattern: /\b(exotic|ethnic food|articulate for)\b/i,
    severity: 'medium',
    description: 'Microaggressive language',
  },

  // Socioeconomic bias patterns
  {
    category: 'socioeconomic',
    pattern: /\b(can you afford|people like you.*money|lower class)\b/i,
    severity: 'high',
    description: 'Socioeconomic assumptions',
  },
  {
    category: 'socioeconomic',
    pattern: /\b(welfare|handouts|lazy.*poor)\b/i,
    severity: 'medium',
    description: 'Socioeconomic stereotyping',
  },

  // Disability bias patterns
  {
    category: 'disability',
    pattern: /\b(crazy|insane|mental|retarded|crippled)\b/i,
    severity: 'high',
    description: 'Ableist language',
  },
  {
    category: 'disability',
    pattern: /\b(confined to|wheelchair-bound|suffers from|victim of)\b/i,
    severity: 'medium',
    description: 'Disempowering disability language',
  },
  {
    category: 'disability',
    pattern: /\b(special needs|differently abled|handicapped)\b/i,
    severity: 'low',
    description: 'Outdated disability terminology',
  },

  // Weight bias patterns
  {
    category: 'weight',
    pattern: /\b(just lose weight|if you weren't so (fat|heavy|overweight))\b/i,
    severity: 'high',
    description: 'Weight-based dismissal of symptoms',
  },
  {
    category: 'weight',
    pattern: /\b(for someone your size|considering your weight)\b/i,
    severity: 'medium',
    description: 'Weight-focused framing',
  },

  // Language bias patterns
  {
    category: 'language',
    pattern: /\b(speak English|don't understand you|learn the language)\b/i,
    severity: 'high',
    description: 'Language discrimination',
  },

  // Religion bias patterns
  {
    category: 'religion',
    pattern: /\b(your religion.*problem|religious beliefs.*wrong)\b/i,
    severity: 'high',
    description: 'Religious discrimination',
  },
];

// ==================== Medical-Specific Bias Checks ====================

const MEDICAL_BIAS_PATTERNS = [
  {
    pattern: /\b(drug.seeking|attention.seeking|non.compliant patient)\b/i,
    severity: 'high' as const,
    description: 'Stigmatizing patient labels',
    category: 'medical_bias' as const,
  },
  {
    pattern: /\b(frequent flyer|difficult patient|problem patient)\b/i,
    severity: 'high' as const,
    description: 'Derogatory patient categorization',
    category: 'medical_bias' as const,
  },
  {
    pattern: /\b(it's all in your head|nothing wrong with you|just stress)\b/i,
    severity: 'high' as const,
    description: 'Dismissal of patient concerns',
    category: 'medical_bias' as const,
  },
  {
    pattern: /\b(typical (diabetic|obese|elderly) patient)\b/i,
    severity: 'medium' as const,
    description: 'Condition-based stereotyping',
    category: 'medical_bias' as const,
  },
];

// ==================== Bias Detection Results ====================

export interface BiasDetection {
  found: boolean;
  issues: BiasIssue[];
  overallScore: number; // 0-100, higher is less biased
  categories: BiasCategory[];
  recommendations: string[];
}

export interface BiasIssue {
  category: BiasCategory | 'medical_bias';
  severity: 'low' | 'medium' | 'high';
  description: string;
  matchedText: string;
  position: number;
  recommendation: string;
}

// ==================== Bias Detection Functions ====================

/**
 * Detect potential biases in AI-generated text
 */
export function detectBias(text: string): BiasDetection {
  const issues: BiasIssue[] = [];
  const categoriesFound = new Set<BiasCategory>();

  // Check general bias patterns
  for (const indicator of BIAS_INDICATORS) {
    const matches = text.matchAll(new RegExp(indicator.pattern, 'gi'));
    for (const match of matches) {
      issues.push({
        category: indicator.category,
        severity: indicator.severity,
        description: indicator.description,
        matchedText: match[0],
        position: match.index || 0,
        recommendation: getRecommendation(indicator.category, indicator.description),
      });
      categoriesFound.add(indicator.category);
    }
  }

  // Check medical-specific bias patterns
  for (const pattern of MEDICAL_BIAS_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.pattern, 'gi'));
    for (const match of matches) {
      issues.push({
        category: pattern.category,
        severity: pattern.severity,
        description: pattern.description,
        matchedText: match[0],
        position: match.index || 0,
        recommendation: getMedicalRecommendation(pattern.description),
      });
    }
  }

  // Calculate overall score
  const overallScore = calculateBiasScore(issues);

  // Generate recommendations
  const recommendations = generateRecommendations(issues, categoriesFound);

  const result: BiasDetection = {
    found: issues.length > 0,
    issues,
    overallScore,
    categories: Array.from(categoriesFound),
    recommendations,
  };

  // Log bias detection
  if (issues.length > 0) {
    logger.warn('Bias detected in AI response', {
      type: 'bias_detection',
      issueCount: issues.length,
      categories: Array.from(categoriesFound),
      score: overallScore,
    });
  }

  return result;
}

/**
 * Calculate bias score (0-100, higher is better/less biased)
 */
function calculateBiasScore(issues: BiasIssue[]): number {
  if (issues.length === 0) return 100;

  let penalty = 0;

  for (const issue of issues) {
    switch (issue.severity) {
      case 'high':
        penalty += 25;
        break;
      case 'medium':
        penalty += 15;
        break;
      case 'low':
        penalty += 5;
        break;
    }
  }

  return Math.max(0, 100 - penalty);
}

/**
 * Get recommendation for a bias category
 */
function getRecommendation(category: BiasCategory, description: string): string {
  const recommendations: Record<BiasCategory, string> = {
    gender: 'Use gender-neutral language and avoid stereotypes about emotional responses.',
    age: 'Avoid age-based assumptions about patient capabilities or understanding.',
    race_ethnicity: 'Use inclusive language and avoid cultural assumptions.',
    socioeconomic: 'Focus on medical needs without making assumptions about financial status.',
    disability: 'Use person-first language (e.g., "person with diabetes" not "diabetic").',
    religion: 'Respect patient beliefs and accommodate religious considerations.',
    language: 'Provide translation services and avoid language-based judgments.',
    weight: 'Address symptoms independently of weight and avoid weight-focused framing.',
  };

  return recommendations[category] || 'Review language for potential bias.';
}

/**
 * Get medical-specific recommendation
 */
function getMedicalRecommendation(description: string): string {
  if (description.includes('dismissal')) {
    return 'Take all patient concerns seriously and investigate symptoms thoroughly.';
  }
  if (description.includes('labels') || description.includes('categorization')) {
    return 'Avoid labeling patients; focus on their current medical needs.';
  }
  if (description.includes('stereotyping')) {
    return 'Treat each patient as an individual, not a representative of a condition.';
  }
  return 'Use professional, respectful language in all patient communications.';
}

/**
 * Generate overall recommendations
 */
function generateRecommendations(
  issues: BiasIssue[],
  categories: Set<BiasCategory>
): string[] {
  const recommendations: string[] = [];

  if (issues.length === 0) {
    recommendations.push('No bias detected. Continue using inclusive language.');
    return recommendations;
  }

  // Add category-specific recommendations
  for (const category of categories) {
    recommendations.push(getRecommendation(category, ''));
  }

  // Add severity-based recommendations
  const highSeverityCount = issues.filter(i => i.severity === 'high').length;
  if (highSeverityCount > 0) {
    recommendations.push(
      'URGENT: High-severity bias detected. Immediate review and revision required.'
    );
  }

  // General recommendations
  recommendations.push('Consider having content reviewed by a diversity committee.');
  recommendations.push('Use AI bias detection tools during content generation.');

  return [...new Set(recommendations)]; // Remove duplicates
}

// ==================== Fairness Metrics ====================

export interface FairnessMetrics {
  demographicParity: number;
  equalOpportunity: number;
  predictiveParity: number;
  overallFairness: number;
}

/**
 * Calculate fairness metrics for a set of responses
 */
export function calculateFairnessMetrics(
  responses: Array<{ text: string; demographic?: string }>
): FairnessMetrics {
  const biasResults = responses.map(r => detectBias(r.text));

  // Calculate average scores
  const avgScore = biasResults.reduce((sum, r) => sum + r.overallScore, 0) / biasResults.length;

  // Demographic parity: consistency across demographics
  const demographicGroups = new Map<string, number[]>();
  responses.forEach((r, i) => {
    const demo = r.demographic || 'unknown';
    if (!demographicGroups.has(demo)) {
      demographicGroups.set(demo, []);
    }
    demographicGroups.get(demo)!.push(biasResults[i].overallScore);
  });

  // Calculate variance across demographics
  const groupAverages = Array.from(demographicGroups.values()).map(
    scores => scores.reduce((a, b) => a + b, 0) / scores.length
  );
  const variance =
    groupAverages.length > 1
      ? groupAverages.reduce((sum, avg) => sum + Math.pow(avg - avgScore, 2), 0) /
        groupAverages.length
      : 0;

  const demographicParity = Math.max(0, 100 - variance);

  return {
    demographicParity,
    equalOpportunity: avgScore, // Simplified: same as average score
    predictiveParity: avgScore, // Simplified: same as average score
    overallFairness: (demographicParity + avgScore * 2) / 3,
  };
}

// ==================== Bias Report Generation ====================

export interface BiasReport {
  timestamp: Date;
  totalResponses: number;
  biasedResponses: number;
  biasRate: number;
  issuesByCategory: Record<string, number>;
  issuesBySeverity: Record<string, number>;
  averageScore: number;
  fairnessMetrics: FairnessMetrics;
  recommendations: string[];
}

/**
 * Generate a comprehensive bias report
 */
export function generateBiasReport(
  responses: Array<{ text: string; demographic?: string }>
): BiasReport {
  const biasResults = responses.map(r => detectBias(r.text));

  const issuesByCategory: Record<string, number> = {};
  const issuesBySeverity: Record<string, number> = { high: 0, medium: 0, low: 0 };
  const allRecommendations = new Set<string>();

  let biasedCount = 0;

  for (const result of biasResults) {
    if (result.found) {
      biasedCount++;
    }

    for (const issue of result.issues) {
      issuesByCategory[issue.category] = (issuesByCategory[issue.category] || 0) + 1;
      issuesBySeverity[issue.severity]++;
      allRecommendations.add(issue.recommendation);
    }

    result.recommendations.forEach(r => allRecommendations.add(r));
  }

  const avgScore =
    biasResults.reduce((sum, r) => sum + r.overallScore, 0) / biasResults.length;

  return {
    timestamp: new Date(),
    totalResponses: responses.length,
    biasedResponses: biasedCount,
    biasRate: (biasedCount / responses.length) * 100,
    issuesByCategory,
    issuesBySeverity,
    averageScore: avgScore,
    fairnessMetrics: calculateFairnessMetrics(responses),
    recommendations: Array.from(allRecommendations),
  };
}

/**
 * Log bias check result
 */
export function logBiasCheck(
  responseId: string,
  result: BiasDetection
): void {
  logger.info('Bias check completed', {
    type: 'bias_check',
    responseId,
    found: result.found,
    issueCount: result.issues.length,
    score: result.overallScore,
    categories: result.categories,
  });
}

export default {
  detectBias,
  calculateFairnessMetrics,
  generateBiasReport,
  logBiasCheck,
  BIAS_INDICATORS,
};
