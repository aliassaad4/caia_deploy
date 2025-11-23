import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';

export const registerDoctor = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password, firstName, lastName, specialty, licenseNumber } = req.body;

    if (!email || !password || !firstName || !lastName) {
      throw new AppError('Missing required fields', 400);
    }

    // Check if doctor already exists
    const existingDoctor = await prisma.provider.findUnique({
      where: { email },
    });

    if (existingDoctor) {
      throw new AppError('Email already registered', 409);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create doctor
    const doctor = await prisma.provider.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        specialty,
        licenseNumber,
      },
    });

    res.status(201).json({
      status: 'success',
      message: 'Doctor registered successfully',
      data: {
        id: doctor.id,
        email: doctor.email,
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        specialty: doctor.specialty,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const loginDoctor = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('Email and password required', 400);
    }

    // Find doctor
    const doctor = await prisma.provider.findUnique({
      where: { email },
    });

    if (!doctor) {
      throw new AppError('Invalid credentials', 401);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, doctor.passwordHash);

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
        id: doctor.id,
        email: doctor.email,
        role: 'doctor',
      },
      jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      status: 'success',
      data: {
        token,
        doctor: {
          id: doctor.id,
          email: doctor.email,
          firstName: doctor.firstName,
          lastName: doctor.lastName,
          specialty: doctor.specialty,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
