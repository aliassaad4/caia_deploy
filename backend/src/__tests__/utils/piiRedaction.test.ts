import { redactPII, redactPatientContext, containsPII } from '../../utils/piiRedaction';

describe('PII Redaction', () => {
  describe('redactPII', () => {
    it('should redact phone numbers', () => {
      const input = 'Call me at 555-123-4567';
      const result = redactPII(input);
      expect(result.redactedText).toContain('[PHONE_REDACTED]');
      expect(result.redactedText).not.toContain('555-123-4567');
      expect(result.redactedItems).toHaveLength(1);
      expect(result.redactedItems[0].type).toBe('phone');
    });

    it('should redact email addresses', () => {
      const input = 'My email is patient@example.com';
      const result = redactPII(input);
      expect(result.redactedText).toContain('[EMAIL_REDACTED]');
      expect(result.redactedText).not.toContain('patient@example.com');
    });

    it('should redact SSN', () => {
      const input = 'My SSN is 123-45-6789';
      const result = redactPII(input);
      expect(result.redactedText).toContain('[SSN_REDACTED]');
      expect(result.redactedText).not.toContain('123-45-6789');
    });

    it('should redact multiple PII types', () => {
      const input = 'Call 555-123-4567 or email test@test.com';
      const result = redactPII(input);
      expect(result.redactedItems.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle empty input', () => {
      const result = redactPII('');
      expect(result.redactedText).toBe('');
      expect(result.redactedItems).toHaveLength(0);
    });

    it('should handle input with no PII', () => {
      const input = 'I have a headache and fever';
      const result = redactPII(input);
      expect(result.redactedText).toBe(input);
      expect(result.redactedItems).toHaveLength(0);
    });
  });

  describe('redactPatientContext', () => {
    it('should redact email in patient context', () => {
      const context = { email: 'patient@test.com', name: 'John' };
      const result = redactPatientContext(context);
      expect(result.email).toBe('[EMAIL_REDACTED]');
      expect(result.name).toBe('John');
    });

    it('should redact phone in patient context', () => {
      const context = { phone: '555-123-4567' };
      const result = redactPatientContext(context);
      expect(result.phone).toBe('[PHONE_REDACTED]');
    });

    it('should convert dateOfBirth to age', () => {
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
      const context = { dateOfBirth: tenYearsAgo.toISOString() };
      const result = redactPatientContext(context);
      expect(result.dateOfBirth).toContain('[AGE:');
      expect(result.dateOfBirth).toContain('years]');
    });

    it('should handle null context', () => {
      const result = redactPatientContext(null);
      expect(result).toBeNull();
    });
  });

  describe('containsPII', () => {
    it('should detect phone numbers', () => {
      expect(containsPII('Call 555-123-4567')).toBe(true);
    });

    it('should detect emails', () => {
      expect(containsPII('Email: test@test.com')).toBe(true);
    });

    it('should return false for clean text', () => {
      expect(containsPII('I have symptoms')).toBe(false);
    });
  });
});
