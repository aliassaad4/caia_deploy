import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { calculatePriorityScore } from '../services/priorityScoring';

export const getAppointments = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    console.log(`📋 Fetching appointments for patient: ${req.user.id}`);
    console.log(`   Current time (UTC): ${new Date().toISOString()}`);

    // Get appointments scheduled from 2 hours ago to account for timezone differences
    // This ensures appointments don't disappear immediately after their scheduled time
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const appointments = await prisma.visit.findMany({
      where: {
        patientId: req.user.id,
        status: {
          in: ['SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS'],
        },
        scheduledAt: {
          gte: twoHoursAgo, // Show appointments from 2 hours ago onwards
        },
      },
      orderBy: {
        scheduledAt: 'asc',
      },
    });

    console.log(`   Found ${appointments.length} appointments`);
    if (appointments.length > 0) {
      console.log(`   First appointment at: ${appointments[0].scheduledAt.toISOString()}`);
    }

    res.json({
      status: 'success',
      data: appointments,
    });
  } catch (error) {
    next(error);
  }
};

export const getCompletedVisits = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const completedVisits = await prisma.visit.findMany({
      where: {
        patientId: req.user.id,
        status: 'COMPLETED',
      },
      include: {
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialty: true,
          },
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
      take: 50, // Limit to last 50 completed visits
    });

    res.json({
      status: 'success',
      data: completedVisits,
    });
  } catch (error) {
    next(error);
  }
};

export const getAvailableSlots = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { providerId, visitType, date, duration } = req.query;

    if (!providerId || !visitType || !date) {
      throw new AppError('Missing required parameters', 400);
    }

    // Get provider details
    const provider = await prisma.provider.findUnique({
      where: { id: providerId as string },
    });

    if (!provider) {
      throw new AppError('Provider not found', 404);
    }

    // Calculate appointment duration based on visit type and provider rules
    const durationRules = (provider.durationRules as Record<string, number>) || {};
    const appointmentDuration = duration
      ? parseInt(duration as string)
      : durationRules[visitType as string] || 15;

    // Get existing appointments for the day
    const startOfDay = new Date(date as string);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date as string);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointments = await prisma.visit.findMany({
      where: {
        scheduledAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: {
          in: ['SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS'],
        },
      },
      select: {
        scheduledAt: true,
        durationMinutes: true,
      },
    });

    // Get provider working hours (simplified - should integrate with calendar)
    const workingHours = (provider.workingHours as Record<string, any>) || {
      monday: [{ start: '09:00', end: '17:00' }],
      tuesday: [{ start: '09:00', end: '17:00' }],
      wednesday: [{ start: '09:00', end: '17:00' }],
      thursday: [{ start: '09:00', end: '17:00' }],
      friday: [{ start: '09:00', end: '17:00' }],
    };

    const dayOfWeek = startOfDay.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const daySchedule = workingHours[dayOfWeek] || [];

    // Generate available slots
    const slots: { time: string; available: boolean }[] = [];

    for (const schedule of daySchedule) {
      const [startHour, startMinute] = schedule.start.split(':').map(Number);
      const [endHour, endMinute] = schedule.end.split(':').map(Number);

      let currentTime = new Date(startOfDay);
      currentTime.setHours(startHour, startMinute, 0, 0);

      const endTime = new Date(startOfDay);
      endTime.setHours(endHour, endMinute, 0, 0);

      while (currentTime < endTime) {
        const slotTime = new Date(currentTime);

        // Check if slot conflicts with existing appointments
        const hasConflict = existingAppointments.some((appt) => {
          const apptStart = new Date(appt.scheduledAt);
          const apptEnd = new Date(apptStart.getTime() + appt.durationMinutes * 60000);
          const slotEnd = new Date(slotTime.getTime() + appointmentDuration * 60000);

          return (
            (slotTime >= apptStart && slotTime < apptEnd) ||
            (slotEnd > apptStart && slotEnd <= apptEnd) ||
            (slotTime <= apptStart && slotEnd >= apptEnd)
          );
        });

        slots.push({
          time: slotTime.toISOString(),
          available: !hasConflict,
        });

        currentTime.setMinutes(currentTime.getMinutes() + 15); // 15-minute intervals
      }
    }

    res.json({
      status: 'success',
      data: {
        providerId,
        date,
        duration: appointmentDuration,
        slots: slots.filter((slot) => slot.available),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const bookAppointment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const {
      scheduledAt,
      visitType,
      reasonForVisit,
      symptoms,
      durationMinutes,
      providerId,
    } = req.body;

    if (!scheduledAt || !visitType || !reasonForVisit) {
      throw new AppError('Missing required fields', 400);
    }

    // If providerId is provided, verify the provider exists
    if (providerId) {
      const provider = await prisma.provider.findUnique({
        where: { id: providerId },
      });

      if (!provider) {
        throw new AppError('Provider not found', 404);
      }
    }

    // Calculate priority score based on symptoms
    const priorityScore = calculatePriorityScore(symptoms || reasonForVisit);

    // Check if urgent/emergency
    if (priorityScore >= 9) {
      // Create Q-Board entry for immediate attention
      await prisma.qBoard.create({
        data: {
          patientId: req.user.id,
          question: `URGENT: ${reasonForVisit}`,
          context: symptoms,
          category: 'urgent',
          urgency: priorityScore,
        },
      });

      return res.json({
        status: 'emergency',
        message:
          'Based on your symptoms, you should seek immediate emergency care. Please call 911 or visit your nearest emergency room.',
        priorityScore,
      });
    }

    // Check for slot conflicts
    const appointmentDate = new Date(scheduledAt);
    const duration = durationMinutes || 15;

    const conflicts = await prisma.visit.findMany({
      where: {
        scheduledAt: {
          gte: new Date(appointmentDate.getTime() - duration * 60000),
          lte: new Date(appointmentDate.getTime() + duration * 60000),
        },
        status: {
          in: ['SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS'],
        },
      },
    });

    if (conflicts.length > 0) {
      throw new AppError('Time slot not available', 409);
    }

    // Create appointment
    const visit = await prisma.visit.create({
      data: {
        patientId: req.user.id,
        providerId: providerId || null,
        scheduledAt: appointmentDate,
        status: 'SCHEDULED',
        visitType,
        reasonForVisit,
        durationMinutes: duration,
        priorityScore,
        hpiDraft: symptoms,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorType: 'patient',
        actorId: req.user.id,
        action: 'create',
        resourceType: 'visit',
        resourceId: visit.id,
        metadata: { visitType, reasonForVisit, priorityScore },
      },
    });

    res.status(201).json({
      status: 'success',
      message: 'Appointment booked successfully',
      data: visit,
    });
  } catch (error) {
    next(error);
  }
};

export const rescheduleAppointment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;
    const { scheduledAt } = req.body;

    if (!scheduledAt) {
      throw new AppError('New time required', 400);
    }

    // Verify appointment belongs to user
    const visit = await prisma.visit.findFirst({
      where: {
        id,
        patientId: req.user.id,
        status: 'SCHEDULED',
      },
      include: {
        provider: {
          select: {
            id: true,
            calendarConnected: true,
            clinicAddress: true,
            clinicCity: true,
            clinicCountry: true,
          },
        },
        patient: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!visit) {
      throw new AppError('Appointment not found or cannot be rescheduled', 404);
    }

    const newScheduledAt = new Date(scheduledAt);

    // Update Google Calendar event if calendar is connected and event ID exists
    if (visit.provider?.calendarConnected && visit.calendarEventId && visit.patient) {
      try {
        const { updateCalendarEvent } = await import('../services/googleCalendarService');
        const durationMinutes = visit.durationMinutes || 30;
        const endTime = new Date(newScheduledAt.getTime() + durationMinutes * 60000);

        await updateCalendarEvent(
          visit.providerId!,
          visit.calendarEventId,
          {
            summary: `${visit.visitType}: ${visit.patient.firstName} ${visit.patient.lastName}`,
            description: `Reason: ${visit.reasonForVisit}\nRescheduled appointment`,
            start: newScheduledAt,
            end: endTime,
            attendees: visit.patient.email ? [visit.patient.email] : [],
            location: visit.provider.clinicAddress ? `${visit.provider.clinicAddress}, ${visit.provider.clinicCity}, ${visit.provider.clinicCountry}` : undefined,
          }
        );

        console.log(`✅ Calendar event updated for rescheduled appointment: ${visit.calendarEventId}`);
      } catch (error) {
        console.error('⚠️ Failed to update calendar event for rescheduled appointment:', error);
        // Don't throw - appointment is still rescheduled in database
      }
    }

    // Update appointment
    const updatedVisit = await prisma.visit.update({
      where: { id },
      data: { scheduledAt: newScheduledAt },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorType: 'patient',
        actorId: req.user.id,
        action: 'update',
        resourceType: 'visit',
        resourceId: id,
        changes: { scheduledAt },
      },
    });

    res.json({
      status: 'success',
      message: 'Appointment rescheduled successfully',
      data: updatedVisit,
    });
  } catch (error) {
    next(error);
  }
};

export const cancelAppointment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;

    // Verify appointment belongs to user and can be cancelled
    const visit = await prisma.visit.findFirst({
      where: {
        id,
        patientId: req.user.id,
        status: { in: ['SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS'] }, // Allow canceling appointments that haven't completed
      },
      include: {
        provider: {
          select: {
            id: true,
            calendarConnected: true,
          },
        },
      },
    });

    if (!visit) {
      throw new AppError('Appointment not found or cannot be cancelled', 404);
    }

    // Delete Google Calendar event if calendar is connected and event ID exists
    if (visit.provider?.calendarConnected && visit.calendarEventId) {
      try {
        const { deleteCalendarEvent } = await import('../services/googleCalendarService');
        await deleteCalendarEvent(visit.providerId!, visit.calendarEventId);
        console.log(`✅ Calendar event deleted for cancelled appointment: ${visit.calendarEventId}`);
      } catch (error) {
        console.error('⚠️ Failed to delete calendar event for cancelled appointment:', error);
        // Don't throw - appointment is still cancelled in database
      }
    }

    // Cancel appointment
    const updatedVisit = await prisma.visit.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorType: 'patient',
        actorId: req.user.id,
        action: 'update',
        resourceType: 'visit',
        resourceId: id,
        metadata: { action: 'cancelled' },
      },
    });

    res.json({
      status: 'success',
      message: 'Appointment cancelled successfully',
      data: updatedVisit,
    });
  } catch (error) {
    next(error);
  }
};
