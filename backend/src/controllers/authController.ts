import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import crypto from 'crypto';
import { sendWelcomeEmail } from '../services/emailService';

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password, firstName, lastName, dateOfBirth, phone } = req.body;

    // Validate input
    if (!email || !password || !firstName || !lastName) {
      throw new AppError('Missing required fields', 400);
    }

    // Check if user already exists
    const existingPatient = await prisma.patient.findUnique({
      where: { email },
    });

    if (existingPatient) {
      throw new AppError('Email already registered', 409);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create patient
    const patient = await prisma.patient.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        phone,
      },
    });

    // Create clinical profile
    await prisma.clinicalProfile.create({
      data: {
        patientId: patient.id,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorType: 'patient',
        actorId: patient.id,
        action: 'create',
        resourceType: 'patient',
        resourceId: patient.id,
        metadata: { email },
      },
    });

    // Send welcome email (don't fail registration if email fails)
    try {
      await sendWelcomeEmail({
        to: patient.email,
        firstName: patient.firstName,
        lastName: patient.lastName,
      });
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Continue with registration - don't throw error
    }

    res.status(201).json({
      status: 'success',
      message: 'Patient registered successfully',
      data: {
        id: patient.id,
        email: patient.email,
        firstName: patient.firstName,
        lastName: patient.lastName,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('Email and password required', 400);
    }

    // Find patient
    const patient = await prisma.patient.findUnique({
      where: { email },
    });

    if (!patient) {
      throw new AppError('Invalid credentials', 401);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, patient.passwordHash);

    if (!isValidPassword) {
      throw new AppError('Invalid credentials', 401);
    }

    // Generate JWT
    const jwtSecret = process.env.JWT_SIGNING_KEY;
    if (!jwtSecret) {
      throw new Error('JWT_SIGNING_KEY not configured');
    }

    const token = jwt.sign(
      {
        id: patient.id,
        email: patient.email,
        role: 'patient',
      },
      jwtSecret,
      { expiresIn: '7d' }
    );

    // Create session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.portalSession.create({
      data: {
        patientId: patient.id,
        token,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        expiresAt,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorType: 'patient',
        actorId: patient.id,
        action: 'view',
        resourceType: 'patient',
        resourceId: patient.id,
        metadata: { action: 'login' },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({
      status: 'success',
      data: {
        token,
        patient: {
          id: patient.id,
          email: patient.email,
          firstName: patient.firstName,
          lastName: patient.lastName,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      // Revoke session
      await prisma.portalSession.updateMany({
        where: { token },
        data: { revokedAt: new Date() },
      });
    }

    res.json({
      status: 'success',
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const magicLink = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new AppError('Email required', 400);
    }

    // Find patient
    const patient = await prisma.patient.findUnique({
      where: { email },
    });

    if (!patient) {
      // Don't reveal if email exists or not for security
      return res.json({
        status: 'success',
        message: 'If the email exists, a magic link has been sent',
      });
    }

    // Generate magic token
    const magicToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry

    // Store magic token in session
    await prisma.portalSession.create({
      data: {
        patientId: patient.id,
        token: magicToken,
        expiresAt,
      },
    });

    // TODO: Send email with magic link
    // For now, just return the token (in production, send via email)
    console.log(`Magic link token for ${email}: ${magicToken}`);

    res.json({
      status: 'success',
      message: 'If the email exists, a magic link has been sent',
      // Remove this in production:
      debug: { magicToken },
    });
  } catch (error) {
    next(error);
  }
};
