/**
 * Tests for Bias Checks - Fairness Evaluation
 */

import {
  detectBias,
  calculateFairnessMetrics,
  generateBiasReport,
  BiasDetection,
} from '../../utils/biasChecks';

describe('Bias Checks', () => {
  describe('detectBias', () => {
    describe('Gender Bias Detection', () => {
      it('should detect dismissive gender language', () => {
        const text = 'The woman was being hysterical about her symptoms.';
        const result = detectBias(text);

        expect(result.found).toBe(true);
        expect(result.categories).toContain('gender');
        expect(result.issues.some(i => i.category === 'gender')).toBe(true);
      });

      it('should detect gender stereotyping', () => {
        const text = 'Just man up and deal with the pain.';
        const result = detectBias(text);

        expect(result.found).toBe(true);
        expect(result.issues.some(i => i.category === 'gender')).toBe(true);
      });

      it('should not flag neutral gender language', () => {
        const text = 'The patient reported feeling better after treatment.';
        const result = detectBias(text);

        expect(result.categories).not.toContain('gender');
      });
    });

    describe('Age Bias Detection', () => {
      it('should detect ageist assumptions', () => {
        const text = "At your age, you can't expect to feel any better.";
        const result = detectBias(text);

        expect(result.found).toBe(true);
        expect(result.categories).toContain('age');
      });

      it('should detect elderly stereotyping', () => {
        const text = "You're too old to understand modern treatments.";
        const result = detectBias(text);

        expect(result.found).toBe(true);
        expect(result.issues.some(i => i.category === 'age')).toBe(true);
      });
    });

    describe('Disability Bias Detection', () => {
      it('should detect ableist language', () => {
        const text = 'That idea is crazy and makes no sense.';
        const result = detectBias(text);

        expect(result.found).toBe(true);
        expect(result.categories).toContain('disability');
      });

      it('should detect disempowering language', () => {
        const text = 'The patient is wheelchair-bound and cannot move independently.';
        const result = detectBias(text);

        expect(result.found).toBe(true);
        expect(result.issues.some(i =>
          i.category === 'disability' && i.description.includes('Disempowering')
        )).toBe(true);
      });

      it('should suggest person-first language', () => {
        const text = 'The patient suffers from diabetes.';
        const result = detectBias(text);

        expect(result.found).toBe(true);
        expect(result.recommendations.some(r => r.includes('person-first'))).toBe(true);
      });
    });

    describe('Weight Bias Detection', () => {
      it('should detect weight-based dismissal', () => {
        const text = "If you weren't so overweight, you wouldn't have these issues.";
        const result = detectBias(text);

        expect(result.found).toBe(true);
        expect(result.categories).toContain('weight');
        expect(result.issues.some(i => i.severity === 'high')).toBe(true);
      });

      it('should detect weight-focused framing', () => {
        const text = 'For someone your size, these symptoms are expected.';
        const result = detectBias(text);

        expect(result.found).toBe(true);
        expect(result.categories).toContain('weight');
      });
    });

    describe('Medical Bias Detection', () => {
      it('should detect stigmatizing patient labels', () => {
        const text = 'This patient is a known drug-seeking individual.';
        const result = detectBias(text);

        expect(result.found).toBe(true);
        expect(result.issues.some(i =>
          i.description.includes('Stigmatizing')
        )).toBe(true);
      });

      it('should detect dismissal of patient concerns', () => {
        const text = "It's all in your head, there's nothing wrong with you.";
        const result = detectBias(text);

        expect(result.found).toBe(true);
        expect(result.issues.some(i =>
          i.description.includes('Dismissal')
        )).toBe(true);
      });

      it('should detect derogatory categorization', () => {
        const text = 'Another frequent flyer in the ER today.';
        const result = detectBias(text);

        expect(result.found).toBe(true);
        expect(result.issues.some(i => i.severity === 'high')).toBe(true);
      });
    });

    describe('Bias Score Calculation', () => {
      it('should return 100 for unbiased text', () => {
        const text = 'The patient presents with symptoms of fever and fatigue. Treatment plan includes rest and hydration.';
        const result = detectBias(text);

        expect(result.overallScore).toBe(100);
        expect(result.found).toBe(false);
      });

      it('should penalize high-severity issues heavily', () => {
        const text = "At your age, you can't expect better. You're too old.";
        const result = detectBias(text);

        expect(result.overallScore).toBeLessThan(75);
      });

      it('should penalize multiple issues cumulatively', () => {
        const text = "The hysterical woman is too old and probably just crazy.";
        const result = detectBias(text);

        expect(result.overallScore).toBeLessThan(50);
        expect(result.issues.length).toBeGreaterThan(2);
      });
    });

    describe('Recommendations', () => {
      it('should provide category-specific recommendations', () => {
        // Use text that triggers disability bias (more reliably detected)
        const text = 'The patient is wheelchair-bound and cannot move.';
        const result = detectBias(text);

        // Check that recommendations include disability-related advice
        expect(result.recommendations.some(r =>
          r.toLowerCase().includes('person-first') || r.includes('disability')
        )).toBe(true);
      });

      it('should flag high-severity issues urgently', () => {
        const text = "It's all in your head, nothing wrong with you.";
        const result = detectBias(text);

        expect(result.recommendations.some(r =>
          r.includes('URGENT') || r.includes('High-severity')
        )).toBe(true);
      });

      it('should suggest diversity review', () => {
        const text = 'The patient is wheelchair-bound.';
        const result = detectBias(text);

        expect(result.recommendations.some(r =>
          r.includes('diversity') || r.includes('review')
        )).toBe(true);
      });
    });
  });

  describe('calculateFairnessMetrics', () => {
    it('should calculate perfect fairness for unbiased responses', () => {
      const responses = [
        { text: 'Patient presents with mild symptoms.', demographic: 'A' },
        { text: 'Treatment plan includes medication.', demographic: 'B' },
        { text: 'Follow-up in two weeks recommended.', demographic: 'A' },
      ];

      const metrics = calculateFairnessMetrics(responses);

      expect(metrics.overallFairness).toBe(100);
      expect(metrics.demographicParity).toBe(100);
    });

    it('should detect fairness issues with biased responses', () => {
      const responses = [
        { text: 'The woman was hysterical about symptoms.', demographic: 'female' },
        { text: 'Patient presents normally.', demographic: 'male' },
        { text: 'Another emotional female patient.', demographic: 'female' },
      ];

      const metrics = calculateFairnessMetrics(responses);

      expect(metrics.overallFairness).toBeLessThan(100);
    });

    it('should calculate demographic parity', () => {
      const responses = [
        { text: 'Normal treatment for patient.', demographic: 'A' },
        { text: 'Normal treatment for patient.', demographic: 'B' },
      ];

      const metrics = calculateFairnessMetrics(responses);

      // Equal treatment should have high demographic parity
      expect(metrics.demographicParity).toBeGreaterThan(90);
    });
  });

  describe('generateBiasReport', () => {
    it('should generate comprehensive report', () => {
      const responses = [
        { text: 'Patient presents with symptoms.' },
        { text: 'The hysterical woman was upset.' },
        { text: 'At your age, you cannot expect better.' },
      ];

      const report = generateBiasReport(responses);

      expect(report.totalResponses).toBe(3);
      expect(report.biasedResponses).toBeGreaterThanOrEqual(2);
      expect(report.biasRate).toBeGreaterThan(50);
      expect(report.timestamp).toBeDefined();
    });

    it('should break down issues by category', () => {
      const responses = [
        { text: 'The hysterical woman was upset.' },
        { text: 'At your age, you cannot expect better.' },
      ];

      const report = generateBiasReport(responses);

      // Check that categories are tracked
      expect(Object.keys(report.issuesByCategory).length).toBeGreaterThan(0);
    });

    it('should break down issues by severity', () => {
      const responses = [
        { text: "It's all in your head." },
        { text: 'Wheelchair-bound patient.' },
      ];

      const report = generateBiasReport(responses);

      expect(report.issuesBySeverity.high).toBeGreaterThan(0);
      expect(report.issuesBySeverity.medium).toBeDefined();
    });

    it('should include fairness metrics', () => {
      const responses = [
        { text: 'Normal care provided.', demographic: 'A' },
        { text: 'Normal care provided.', demographic: 'B' },
      ];

      const report = generateBiasReport(responses);

      expect(report.fairnessMetrics).toBeDefined();
      expect(report.fairnessMetrics.overallFairness).toBeDefined();
    });

    it('should generate recommendations', () => {
      const responses = [
        { text: 'The patient is crazy.' },
      ];

      const report = generateBiasReport(responses);

      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should handle empty responses', () => {
      const responses: Array<{ text: string }> = [];

      expect(() => generateBiasReport(responses)).not.toThrow();
    });

    it('should calculate average score', () => {
      const responses = [
        { text: 'Patient is doing well.' },
        { text: 'The hysterical woman.' },
      ];

      const report = generateBiasReport(responses);

      expect(report.averageScore).toBeGreaterThan(0);
      expect(report.averageScore).toBeLessThan(100);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty text', () => {
      const result = detectBias('');
      expect(result.found).toBe(false);
      expect(result.overallScore).toBe(100);
    });

    it('should handle very long text', () => {
      const longText = 'Patient presents normally. '.repeat(1000);
      const result = detectBias(longText);
      expect(result.found).toBe(false);
    });

    it('should be case insensitive', () => {
      const result1 = detectBias('HYSTERICAL woman');
      const result2 = detectBias('hysterical WOMAN');

      expect(result1.found).toBe(result2.found);
    });

    it('should detect multiple biases in one text', () => {
      const text = "The hysterical woman is too old and probably crazy.";
      const result = detectBias(text);

      expect(result.categories.length).toBeGreaterThan(1);
    });
  });
});
