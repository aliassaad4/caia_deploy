import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../index';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/doctor/calendar/google/callback`;

console.log('Google Calendar OAuth configured with redirect URI:', REDIRECT_URI);
console.log('Environment:', process.env.NODE_ENV || 'development');

// Create OAuth2 client
export function getOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
}

// Generate authorization URL
export function getAuthUrl(doctorId: string): string {
  const oauth2Client = getOAuth2Client();

  const scopes = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state: doctorId, // Pass doctor ID in state for callback
    prompt: 'consent', // Force consent screen to get refresh token
  });

  return url;
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(code: string, doctorId: string) {
  try {
    const oauth2Client = getOAuth2Client();

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new Error('No access token received');
    }

    // Get user email
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    // Save tokens to database
    await prisma.provider.update({
      where: { id: doctorId },
      data: {
        calendarProvider: 'google',
        calendarConnected: true,
        calendarAccessToken: tokens.access_token,
        calendarRefreshToken: tokens.refresh_token || null,
        calendarTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        calendarEmail: email || null,
        calendarLastSyncAt: new Date(),
      },
    });

    console.log(`Google Calendar connected for doctor ${doctorId}, email: ${email}`);

    return {
      success: true,
      email,
    };
  } catch (error: any) {
    console.error('Error exchanging code for tokens:', error);
    throw new Error(`Failed to connect Google Calendar: ${error.message}`);
  }
}

// Get authenticated calendar client for a doctor
export async function getCalendarClient(doctorId: string) {
  const doctor = await prisma.provider.findUnique({
    where: { id: doctorId },
    select: {
      calendarAccessToken: true,
      calendarRefreshToken: true,
      calendarTokenExpiry: true,
      calendarConnected: true,
    },
  });

  if (!doctor || !doctor.calendarConnected || !doctor.calendarAccessToken) {
    throw new Error('Calendar not connected');
  }

  const oauth2Client = getOAuth2Client();

  oauth2Client.setCredentials({
    access_token: doctor.calendarAccessToken,
    refresh_token: doctor.calendarRefreshToken || undefined,
    expiry_date: doctor.calendarTokenExpiry ? doctor.calendarTokenExpiry.getTime() : undefined,
  });

  // Check if token needs refresh
  if (doctor.calendarTokenExpiry && new Date() >= doctor.calendarTokenExpiry) {
    console.log('Access token expired, refreshing...');
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();

      // Update tokens in database
      await prisma.provider.update({
        where: { id: doctorId },
        data: {
          calendarAccessToken: credentials.access_token || undefined,
          calendarTokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
        },
      });

      oauth2Client.setCredentials(credentials);
      console.log('Access token refreshed successfully');
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw new Error('Failed to refresh calendar access. Please reconnect your calendar.');
    }
  }

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

// Get doctor's calendar events for a date range
export async function getCalendarEvents(
  doctorId: string,
  startDate: Date,
  endDate: Date
) {
  try {
    const calendar = await getCalendarClient(doctorId);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100, // Explicitly set max results to get all events
    });

    const events = response.data.items || [];

    console.log(`\n📅 GOOGLE CALENDAR API RESPONSE for doctor ${doctorId}:`);
    console.log(`   Query: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`   Result: ${events.length} events returned`);
    events.forEach((event, idx) => {
      const start = event.start?.dateTime || event.start?.date || 'N/A';
      const end = event.end?.dateTime || event.end?.date || 'N/A';
      console.log(`   [${idx + 1}] "${event.summary}": ${start} → ${end}`);
    });

    return events.map(event => ({
      id: event.id,
      summary: event.summary,
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      status: event.status,
      attendees: event.attendees?.map(a => a.email) || [],
    }));
  } catch (error: any) {
    console.error('Error fetching calendar events:', error);
    throw new Error(`Failed to fetch calendar events: ${error.message}`);
  }
}

// Calculate available time slots
export async function getAvailableSlots(
  doctorId: string,
  date: Date,
  durationMinutes: number = 30
) {
  try {
    const doctor = await prisma.provider.findUnique({
      where: { id: doctorId },
      select: {
        workingHours: true,
        timezone: true,
        bufferBefore: true,
        bufferAfter: true,
      },
    });

    if (!doctor) {
      throw new Error('Doctor not found');
    }

    // Get day of week
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const workingHours = (doctor.workingHours as any)?.[dayOfWeek] || [];

    if (workingHours.length === 0) {
      return []; // Doctor doesn't work on this day
    }

    // Get calendar events for the day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const calendarEvents = await getCalendarEvents(doctorId, startOfDay, endOfDay);

    // Generate time slots
    const availableSlots: Array<{ start: Date; end: Date }> = [];

    for (const shift of workingHours) {
      const [startHour, startMinute] = shift.start.split(':').map(Number);
      const [endHour, endMinute] = shift.end.split(':').map(Number);

      const shiftStart = new Date(date);
      shiftStart.setHours(startHour, startMinute, 0, 0);

      const shiftEnd = new Date(date);
      shiftEnd.setHours(endHour, endMinute, 0, 0);

      let currentSlotStart = new Date(shiftStart);

      while (currentSlotStart < shiftEnd) {
        const slotEnd = new Date(currentSlotStart.getTime() + durationMinutes * 60000);

        if (slotEnd > shiftEnd) break;

        // Check if slot conflicts with any calendar event
        const hasConflict = calendarEvents.some(event => {
          const eventStart = new Date(event.start!);
          const eventEnd = new Date(event.end!);

          // Add buffers
          const bufferedSlotStart = new Date(currentSlotStart.getTime() - doctor.bufferBefore! * 60000);
          const bufferedSlotEnd = new Date(slotEnd.getTime() + doctor.bufferAfter! * 60000);

          return (
            (bufferedSlotStart >= eventStart && bufferedSlotStart < eventEnd) ||
            (bufferedSlotEnd > eventStart && bufferedSlotEnd <= eventEnd) ||
            (bufferedSlotStart <= eventStart && bufferedSlotEnd >= eventEnd)
          );
        });

        if (!hasConflict) {
          availableSlots.push({
            start: new Date(currentSlotStart),
            end: new Date(slotEnd),
          });
        }

        currentSlotStart = new Date(slotEnd);
      }
    }

    return availableSlots;
  } catch (error: any) {
    console.error('Error calculating available slots:', error);
    throw new Error(`Failed to calculate available slots: ${error.message}`);
  }
}

// Create a calendar event
export async function createCalendarEvent(
  doctorId: string,
  eventData: {
    summary: string;
    description?: string;
    start: Date;
    end: Date;
    attendees?: string[];
    location?: string;
  }
) {
  try {
    const calendar = await getCalendarClient(doctorId);

    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: eventData.summary,
        description: eventData.description,
        start: {
          dateTime: eventData.start.toISOString(),
          timeZone: 'Asia/Beirut',
        },
        end: {
          dateTime: eventData.end.toISOString(),
          timeZone: 'Asia/Beirut',
        },
        attendees: eventData.attendees?.map(email => ({ email })),
        location: eventData.location,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 1 day before
            { method: 'popup', minutes: 30 }, // 30 minutes before
          ],
        },
      },
      sendUpdates: 'all', // Send email invites to attendees
    });

    console.log(`Calendar event created: ${event.data.id}`);

    return {
      id: event.data.id,
      htmlLink: event.data.htmlLink,
    };
  } catch (error: any) {
    console.error('Error creating calendar event:', error);
    throw new Error(`Failed to create calendar event: ${error.message}`);
  }
}

// Update calendar event
export async function updateCalendarEvent(
  doctorId: string,
  eventId: string,
  eventData: {
    summary?: string;
    description?: string;
    start: Date;
    end: Date;
    location?: string;
    attendees?: string[];
  }
) {
  const calendar = await getCalendarClient(doctorId);

  const event = {
    summary: eventData.summary,
    description: eventData.description,
    start: {
      dateTime: eventData.start.toISOString(),
      timeZone: 'Asia/Beirut',
    },
    end: {
      dateTime: eventData.end.toISOString(),
      timeZone: 'Asia/Beirut',
    },
    location: eventData.location,
    attendees: eventData.attendees?.map(email => ({ email })),
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 }, // 1 day before
        { method: 'popup', minutes: 30 },       // 30 minutes before
      ],
    },
  };

  const response = await calendar.events.update({
    calendarId: 'primary',
    eventId: eventId,
    requestBody: event,
  });

  console.log(`✅ Calendar event updated: ${eventId}`);
  return response.data;
}

// Delete calendar event
export async function deleteCalendarEvent(doctorId: string, eventId: string) {
  const calendar = await getCalendarClient(doctorId);

  await calendar.events.delete({
    calendarId: 'primary',
    eventId: eventId,
  });

  console.log(`✅ Calendar event deleted: ${eventId}`);
}

// Disconnect calendar
export async function disconnectCalendar(doctorId: string) {
  await prisma.provider.update({
    where: { id: doctorId },
    data: {
      calendarProvider: null,
      calendarConnected: false,
      calendarAccessToken: null,
      calendarRefreshToken: null,
      calendarTokenExpiry: null,
      calendarEmail: null,
      calendarLastSyncAt: null,
    },
  });

  console.log(`Calendar disconnected for doctor ${doctorId}`);
}
