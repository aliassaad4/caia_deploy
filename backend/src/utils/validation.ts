/**
 * Input Validation with Zod
 * Provides type-safe validation for all API inputs
 */

import { z } from 'zod';

// ==================== Auth Schemas ====================

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  dateOfBirth: z.string().datetime().optional(),
  phone: z.string().regex(/^\+?[\d\s\-()]+$/, 'Invalid phone number').optional(),
});

export const doctorRegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  specialty: z.string().min(1, 'Specialty is required'),
  licenseNumber: z.string().min(1, 'License number is required'),
});

// ==================== Chat/LLM Schemas ====================

export const chatMessageSchema = z.object({
  message: z.string()
    .min(1, 'Message cannot be empty')
    .max(5000, 'Message too long (max 5000 characters)'),
  conversationId: z.string().uuid().optional(),
});

export const conversationHistorySchema = z.array(z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
})).max(50, 'Conversation history too long');

// ==================== Appointment Schemas ====================

export const bookAppointmentSchema = z.object({
  scheduledAt: z.string().datetime('Invalid date/time format'),
  visitType: z.enum(['new_patient', 'follow_up', 'urgent', 'routine']),
  reasonForVisit: z.string()
    .min(5, 'Please provide more detail about your visit reason')
    .max(1000, 'Reason too long'),
  durationMinutes: z.number().int().min(10).max(120).optional(),
  priorityScore: z.number().int().min(1).max(10).optional(),
});

export const rescheduleAppointmentSchema = z.object({
  appointmentId: z.string().uuid('Invalid appointment ID'),
  newScheduledAt: z.string().datetime('Invalid date/time format'),
  reason: z.string().max(500).optional(),
});

export const cancelAppointmentSchema = z.object({
  appointmentId: z.string().uuid('Invalid appointment ID'),
  reason: z.string().max(500).optional(),
});

export const checkAvailabilitySchema = z.object({
  scheduledAt: z.string().datetime('Invalid date/time format'),
  durationMinutes: z.number().int().min(10).max(120),
});

// ==================== Patient Schemas ====================

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().regex(/^\+?[\d\s\-()]+$/, 'Invalid phone number').optional(),
  dateOfBirth: z.string().datetime().optional(),
  address: z.string().max(500).optional(),
  emergencyContact: z.object({
    name: z.string().max(100),
    phone: z.string().regex(/^\+?[\d\s\-()]+$/),
    relationship: z.string().max(50),
  }).optional(),
});

export const clinicalProfileSchema = z.object({
  allergies: z.array(z.string().max(100)).max(50).optional(),
  medications: z.array(z.string().max(200)).max(100).optional(),
  conditions: z.array(z.string().max(200)).max(100).optional(),
  bloodType: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  familyHistory: z.string().max(2000).optional(),
});

// ==================== File Schemas ====================

export const fileUploadSchema = z.object({
  fileCategory: z.enum([
    'LAB_RESULT',
    'IMAGING',
    'PRESCRIPTION',
    'INSURANCE',
    'ID_DOCUMENT',
    'OTHER',
  ]),
  description: z.string().max(500).optional(),
});

export const fileAnnotationSchema = z.object({
  fileId: z.string().uuid('Invalid file ID'),
  annotationType: z.enum(['highlight', 'note', 'drawing']),
  content: z.string().max(1000),
  pageNumber: z.number().int().min(1).optional(),
  coordinates: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().optional(),
    height: z.number().optional(),
  }).optional(),
});

// ==================== Doctor Schemas ====================

export const doctorSettingsSchema = z.object({
  specialty: z.string().max(100).optional(),
  workingHours: z.object({
    monday: z.object({ start: z.string(), end: z.string() }).optional(),
    tuesday: z.object({ start: z.string(), end: z.string() }).optional(),
    wednesday: z.object({ start: z.string(), end: z.string() }).optional(),
    thursday: z.object({ start: z.string(), end: z.string() }).optional(),
    friday: z.object({ start: z.string(), end: z.string() }).optional(),
    saturday: z.object({ start: z.string(), end: z.string() }).optional(),
    sunday: z.object({ start: z.string(), end: z.string() }).optional(),
  }).optional(),
  appointmentBuffer: z.number().int().min(0).max(60).optional(),
  aiInstructions: z.string().max(2000).optional(),
});

export const approvalActionSchema = z.object({
  action: z.enum(['approve', 'reject', 'revise']),
  comments: z.string().max(1000).optional(),
  editedContent: z.string().max(50000).optional(),
});

// ==================== Validation Middleware ====================

import { Request, Response, NextFunction } from 'express';

/**
 * Creates an Express middleware that validates request body
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.issues.map((e: z.ZodIssue) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
}

/**
 * Creates an Express middleware that validates request query params
 */
export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid query parameters',
          details: error.issues.map((e: z.ZodIssue) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
}

/**
 * Creates an Express middleware that validates request params
 */
export function validateParams<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params) as any;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid URL parameters',
          details: error.issues.map((e: z.ZodIssue) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
}

/**
 * Validate data directly (not middleware)
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safe validation that returns result or null
 */
export function safeParse<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: boolean;
  data?: T;
  errors?: z.ZodIssue[];
} {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.issues };
}

// ==================== Common Param Schemas ====================

export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// Export types
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
export type BookAppointmentInput = z.infer<typeof bookAppointmentSchema>;
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>;
export type FileUploadInput = z.infer<typeof fileUploadSchema>;

export default {
  // Auth
  loginSchema,
  registerSchema,
  doctorRegisterSchema,
  // Chat
  chatMessageSchema,
  conversationHistorySchema,
  // Appointments
  bookAppointmentSchema,
  rescheduleAppointmentSchema,
  cancelAppointmentSchema,
  checkAvailabilitySchema,
  // Patient
  updateProfileSchema,
  clinicalProfileSchema,
  // Files
  fileUploadSchema,
  fileAnnotationSchema,
  // Doctor
  doctorSettingsSchema,
  approvalActionSchema,
  // Common
  uuidParamSchema,
  paginationSchema,
  dateRangeSchema,
  // Middleware
  validateBody,
  validateQuery,
  validateParams,
  validate,
  safeParse,
};
