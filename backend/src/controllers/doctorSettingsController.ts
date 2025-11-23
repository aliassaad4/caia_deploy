import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import {
  getAuthUrl,
  exchangeCodeForTokens,
  disconnectCalendar,
  getAvailableSlots,
} from '../services/googleCalendarService';

// Get doctor settings
export const getSettings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const doctor = await prisma.provider.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        specialty: true,
        licenseNumber: true,
        clinicName: true,
        clinicAddress: true,
        clinicCity: true,
        clinicCountry: true,
        clinicPhone: true,
        profileDescription: true,
        aiInstructions: true,
        preVisitNotes: true,
        locationDetails: true,
        calendarProvider: true,
        calendarConnected: true,
        calendarEmail: true,
        calendarLastSyncAt: true,
        workingHours: true,
        timezone: true,
        bufferBefore: true,
        bufferAfter: true,
      },
    });

    if (!doctor) {
      throw new AppError('Doctor not found', 404);
    }

    res.json({
      status: 'success',
      data: doctor,
    });
  } catch (error) {
    next(error);
  }
};

// Update doctor settings
export const updateSettings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const {
      specialty,
      clinicName,
      clinicAddress,
      clinicCity,
      clinicCountry,
      clinicPhone,
      profileDescription,
      aiInstructions,
      preVisitNotes,
      locationDetails,
      workingHours,
      timezone,
      bufferBefore,
      bufferAfter,
    } = req.body;

    console.log('🔄 UPDATE SETTINGS REQUEST RECEIVED');
    console.log(`Doctor ID: ${req.user.id}`);
    console.log(`Specialty: ${specialty}`);
    console.log(`Profile Description: ${profileDescription?.substring(0, 50)}...`);
    console.log(`Full request body:`, req.body);

    const updatedDoctor = await prisma.provider.update({
      where: { id: req.user.id },
      data: {
        specialty,
        clinicName,
        clinicAddress,
        clinicCity,
        clinicCountry,
        clinicPhone,
        profileDescription,
        aiInstructions,
        preVisitNotes,
        locationDetails,
        workingHours: workingHours || undefined,
        timezone,
        bufferBefore,
        bufferAfter,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        specialty: true,
        licenseNumber: true,
        clinicName: true,
        clinicAddress: true,
        clinicCity: true,
        clinicCountry: true,
        clinicPhone: true,
        profileDescription: true,
        aiInstructions: true,
        preVisitNotes: true,
        locationDetails: true,
        calendarProvider: true,
        calendarConnected: true,
        calendarEmail: true,
        calendarLastSyncAt: true,
        workingHours: true,
        timezone: true,
        bufferBefore: true,
        bufferAfter: true,
      },
    });

    console.log('✅ SETTINGS UPDATED SUCCESSFULLY');
    console.log(`Saved Specialty: ${updatedDoctor.specialty}`);
    console.log(`Saved Profile Description: ${updatedDoctor.profileDescription?.substring(0, 50)}...`);

    res.json({
      status: 'success',
      message: 'Settings updated successfully',
      data: updatedDoctor,
    });
  } catch (error) {
    console.error('❌ ERROR UPDATING SETTINGS:', error);
    next(error);
  }
};

// Get Google Calendar authorization URL
export const getGoogleCalendarAuthUrl = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const authUrl = getAuthUrl(req.user.id);

    res.json({
      status: 'success',
      data: { authUrl },
    });
  } catch (error) {
    next(error);
  }
};

// Google Calendar OAuth callback
export const googleCalendarCallback = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      throw new AppError('Missing authorization code or state', 400);
    }

    const doctorId = state as string;

    const result = await exchangeCodeForTokens(code as string, doctorId);

    // Redirect back to frontend settings page with success message
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    res.redirect(`${frontendUrl}/doctor/settings?calendar=connected&email=${encodeURIComponent(result.email || '')}`);
  } catch (error) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    res.redirect(`${frontendUrl}/doctor/settings?calendar=error`);
  }
};

// Disconnect calendar
export const disconnectGoogleCalendar = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    await disconnectCalendar(req.user.id);

    res.json({
      status: 'success',
      message: 'Calendar disconnected successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Get available time slots for a specific date
export const getAvailableTimeSlots = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { date, durationMinutes } = req.query;

    if (!date) {
      throw new AppError('Date parameter is required', 400);
    }

    const targetDate = new Date(date as string);
    const duration = durationMinutes ? parseInt(durationMinutes as string) : 30;

    const slots = await getAvailableSlots(req.user.id, targetDate, duration);

    res.json({
      status: 'success',
      data: {
        date: targetDate,
        durationMinutes: duration,
        slots,
      },
    });
  } catch (error) {
    next(error);
  }
};
