/**
 * PII Redaction Utility
 * Masks sensitive patient information before sending to external AI services
 */

// Patterns for detecting PII
const PII_PATTERNS = {
  // Phone numbers (various formats)
  phone: /(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,

  // Email addresses
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,

  // Social Security Numbers
  ssn: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,

  // Credit card numbers
  creditCard: /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g,

  // Date of birth patterns (MM/DD/YYYY, DD-MM-YYYY, etc.)
  dob: /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](19|20)\d{2}\b/g,

  // Medical record numbers (common formats)
  mrn: /\b(MRN|mrn|Medical Record|Record #?)[:.\s]?\d{5,10}\b/gi,

  // Insurance ID numbers
  insuranceId: /\b(Insurance ID|Policy #?|Member ID)[:.\s]?[A-Z0-9]{6,15}\b/gi,

  // Street addresses (basic pattern)
  address: /\b\d{1,5}\s+[A-Za-z0-9\s,.'-]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Circle|Cir)\b/gi,

  // Zip codes
  zipCode: /\b\d{5}(-\d{4})?\b/g,
};

// Replacement tokens for each PII type
const REDACTION_TOKENS: Record<string, string> = {
  phone: '[PHONE_REDACTED]',
  email: '[EMAIL_REDACTED]',
  ssn: '[SSN_REDACTED]',
  creditCard: '[CREDIT_CARD_REDACTED]',
  dob: '[DOB_REDACTED]',
  mrn: '[MRN_REDACTED]',
  insuranceId: '[INSURANCE_ID_REDACTED]',
  address: '[ADDRESS_REDACTED]',
  zipCode: '[ZIP_REDACTED]',
};

export interface RedactionResult {
  redactedText: string;
  redactedItems: RedactedItem[];
  originalLength: number;
  redactedLength: number;
}

export interface RedactedItem {
  type: string;
  original: string;
  position: number;
  token: string;
}

/**
 * Redacts PII from text before sending to AI services
 */
export function redactPII(text: string, options?: {
  preserveNames?: boolean;
  customPatterns?: Record<string, RegExp>;
}): RedactionResult {
  if (!text) {
    return {
      redactedText: '',
      redactedItems: [],
      originalLength: 0,
      redactedLength: 0,
    };
  }

  let redactedText = text;
  const redactedItems: RedactedItem[] = [];

  // Apply each pattern
  for (const [piiType, pattern] of Object.entries(PII_PATTERNS)) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[0] && match.index !== undefined) {
        redactedItems.push({
          type: piiType,
          original: match[0],
          position: match.index,
          token: REDACTION_TOKENS[piiType],
        });
        redactedText = redactedText.replace(match[0], REDACTION_TOKENS[piiType]);
      }
    }
  }

  // Apply custom patterns if provided
  if (options?.customPatterns) {
    for (const [name, pattern] of Object.entries(options.customPatterns)) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[0] && match.index !== undefined) {
          const token = `[${name.toUpperCase()}_REDACTED]`;
          redactedItems.push({
            type: name,
            original: match[0],
            position: match.index,
            token,
          });
          redactedText = redactedText.replace(match[0], token);
        }
      }
    }
  }

  return {
    redactedText,
    redactedItems,
    originalLength: text.length,
    redactedLength: redactedText.length,
  };
}

/**
 * Redacts patient context object for safe AI processing
 * Keeps clinical information but removes identifying details
 */
export function redactPatientContext(context: any): any {
  if (!context) return context;

  const redacted = { ...context };

  // Redact identifying fields
  if (redacted.email) {
    redacted.email = '[EMAIL_REDACTED]';
  }
  if (redacted.phone) {
    redacted.phone = '[PHONE_REDACTED]';
  }
  if (redacted.dateOfBirth) {
    // Keep age but not exact date
    const dob = new Date(redacted.dateOfBirth);
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    redacted.dateOfBirth = `[AGE: ${age} years]`;
  }
  if (redacted.address) {
    redacted.address = '[ADDRESS_REDACTED]';
  }
  if (redacted.insuranceId) {
    redacted.insuranceId = '[INSURANCE_ID_REDACTED]';
  }
  if (redacted.ssn) {
    redacted.ssn = '[SSN_REDACTED]';
  }

  // Redact nested objects
  if (redacted.clinicalProfile) {
    redacted.clinicalProfile = { ...redacted.clinicalProfile };
    // Keep clinical data, redact any embedded PII
    for (const key of Object.keys(redacted.clinicalProfile)) {
      if (typeof redacted.clinicalProfile[key] === 'string') {
        redacted.clinicalProfile[key] = redactPII(redacted.clinicalProfile[key]).redactedText;
      }
    }
  }

  // Redact message history
  if (redacted.recentMessages && Array.isArray(redacted.recentMessages)) {
    redacted.recentMessages = redacted.recentMessages.map((msg: any) => ({
      ...msg,
      content: redactPII(msg.content || '').redactedText,
    }));
  }

  return redacted;
}

/**
 * Logs redaction activity for audit purposes
 */
export function logRedactionActivity(
  redactionResult: RedactionResult,
  context: string
): void {
  if (redactionResult.redactedItems.length > 0) {
    console.log(`[PII Redaction] ${context}: Redacted ${redactionResult.redactedItems.length} items`);
    console.log(`[PII Redaction] Types: ${[...new Set(redactionResult.redactedItems.map(i => i.type))].join(', ')}`);
  }
}

/**
 * Checks if text contains potential PII (for validation/warnings)
 */
export function containsPII(text: string): boolean {
  for (const pattern of Object.values(PII_PATTERNS)) {
    if (pattern.test(text)) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      return true;
    }
  }
  return false;
}

export default {
  redactPII,
  redactPatientContext,
  logRedactionActivity,
  containsPII,
};
