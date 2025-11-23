import {
  loginSchema,
  registerSchema,
  chatMessageSchema,
  bookAppointmentSchema,
  checkAvailabilitySchema,
  fileUploadSchema,
  uuidParamSchema,
  paginationSchema,
  safeParse,
  validate,
} from '../../utils/validation';

describe('Validation Schemas', () => {
  describe('loginSchema', () => {
    it('should validate correct login data', () => {
      const result = safeParse(loginSchema, {
        email: 'test@example.com',
        password: 'password123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = safeParse(loginSchema, {
        email: 'invalid-email',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject short password', () => {
      const result = safeParse(loginSchema, {
        email: 'test@example.com',
        password: '12345',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('registerSchema', () => {
    it('should validate correct registration data', () => {
      const result = safeParse(registerSchema, {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing required fields', () => {
      const result = safeParse(registerSchema, {
        email: 'test@example.com',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('should validate optional phone number', () => {
      const result = safeParse(registerSchema, {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1-555-123-4567',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('chatMessageSchema', () => {
    it('should validate correct message', () => {
      const result = safeParse(chatMessageSchema, {
        message: 'I want to book an appointment',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty message', () => {
      const result = safeParse(chatMessageSchema, {
        message: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject too long message', () => {
      const result = safeParse(chatMessageSchema, {
        message: 'a'.repeat(5001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('bookAppointmentSchema', () => {
    it('should validate correct booking data', () => {
      const result = safeParse(bookAppointmentSchema, {
        scheduledAt: '2025-11-25T14:00:00.000Z',
        visitType: 'new_patient',
        reasonForVisit: 'Annual checkup and general health consultation',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid visit type', () => {
      const result = safeParse(bookAppointmentSchema, {
        scheduledAt: '2025-11-25T14:00:00.000Z',
        visitType: 'invalid_type',
        reasonForVisit: 'Annual checkup',
      });
      expect(result.success).toBe(false);
    });

    it('should reject too short reason', () => {
      const result = safeParse(bookAppointmentSchema, {
        scheduledAt: '2025-11-25T14:00:00.000Z',
        visitType: 'routine',
        reasonForVisit: 'hi',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('checkAvailabilitySchema', () => {
    it('should validate correct availability check', () => {
      const result = safeParse(checkAvailabilitySchema, {
        scheduledAt: '2025-11-25T14:00:00.000Z',
        durationMinutes: 30,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid duration', () => {
      const result = safeParse(checkAvailabilitySchema, {
        scheduledAt: '2025-11-25T14:00:00.000Z',
        durationMinutes: 5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('fileUploadSchema', () => {
    it('should validate correct file upload', () => {
      const result = safeParse(fileUploadSchema, {
        fileCategory: 'LAB_RESULT',
        description: 'Blood test results',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid category', () => {
      const result = safeParse(fileUploadSchema, {
        fileCategory: 'INVALID_CATEGORY',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('uuidParamSchema', () => {
    it('should validate correct UUID', () => {
      const result = safeParse(uuidParamSchema, {
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = safeParse(uuidParamSchema, {
        id: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('paginationSchema', () => {
    it('should use defaults for empty input', () => {
      const result = safeParse(paginationSchema, {});
      expect(result.success).toBe(true);
      expect(result.data?.page).toBe(1);
      expect(result.data?.limit).toBe(20);
    });

    it('should validate custom pagination', () => {
      const result = safeParse(paginationSchema, {
        page: '2',
        limit: '50',
        sortOrder: 'asc',
      });
      expect(result.success).toBe(true);
      expect(result.data?.page).toBe(2);
      expect(result.data?.limit).toBe(50);
    });

    it('should reject too high limit', () => {
      const result = safeParse(paginationSchema, {
        limit: '200',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('validate function', () => {
    it('should return parsed data for valid input', () => {
      const data = validate(loginSchema, {
        email: 'test@test.com',
        password: 'password123',
      });
      expect(data.email).toBe('test@test.com');
    });

    it('should throw for invalid input', () => {
      expect(() => {
        validate(loginSchema, { email: 'invalid' });
      }).toThrow();
    });
  });
});
