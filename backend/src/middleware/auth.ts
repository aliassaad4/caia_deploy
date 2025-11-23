import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler';
import { prisma } from '../index';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: 'patient' | 'doctor' | 'admin';
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new AppError('No token provided', 401);
    }

    const jwtSecret = process.env.JWT_SIGNING_KEY;
    if (!jwtSecret) {
      throw new Error('JWT_SIGNING_KEY not configured');
    }

    const decoded = jwt.verify(token, jwtSecret) as {
      id: string;
      email: string;
      role: 'patient' | 'doctor' | 'admin';
    };

    // For patients, verify session in portal_sessions table
    if (decoded.role === 'patient') {
      const session = await prisma.portalSession.findFirst({
        where: {
          token,
          patientId: decoded.id,
          expiresAt: {
            gt: new Date(),
          },
          revokedAt: null,
        },
      });

      if (!session) {
        throw new AppError('Invalid or expired token', 401);
      }

      // Update last active time
      await prisma.portalSession.update({
        where: { id: session.id },
        data: { lastActiveAt: new Date() },
      });
    } else if (decoded.role === 'doctor') {
      // For doctors, just verify the user exists in the database
      const doctor = await prisma.provider.findUnique({
        where: { id: decoded.id },
      });

      if (!doctor) {
        throw new AppError('Doctor not found', 401);
      }
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AppError('Invalid token', 401));
    }
    next(error);
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Not authenticated', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};
