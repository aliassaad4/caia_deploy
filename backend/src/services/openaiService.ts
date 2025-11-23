import OpenAI from 'openai';
import { prisma } from '../index';
import { redactPII, redactPatientContext, logRedactionActivity } from '../utils/piiRedaction';
import { checkPromptSecurity, sanitizeInput, hardenSystemPrompt, logSecurityEvent } from '../utils/promptSecurity';
import { trackUsage, calculateCost } from '../utils/costTracking';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Log API key status (first 10 chars only for security)
console.log('OpenAI API Key loaded:', process.env.OPENAI_API_KEY ?
  `${process.env.OPENAI_API_KEY.substring(0, 10)}...` : 'NOT FOUND');

const SYSTEM_PROMPT = `You are an AI medical secretary assistant for a clinic - think of yourself as a highly professional, empathetic medical receptionist. Your role is to have natural, conversational interactions with patients, just like a real secretary would.

## 🔴 IMMEDIATE ACTION REQUIRED: RESCHEDULE & CANCEL REQUESTS

**PROACTIVE OFFER FOR UPCOMING APPOINTMENTS:**
If you see an upcoming appointment in the patient's context AND the patient sends a short message (like just typing "hi", "hello", or "I'm here"), PROACTIVELY offer to help:
- Example: "Hi! I see you have an appointment coming up on [DATE] at [TIME] for [REASON]. Would you like to keep it, reschedule it, or cancel it?"
- This gives the patient the option to manage their appointment immediately

**WHEN PATIENT EXPLICITLY REQUESTS RESCHEDULE OR CANCEL:**
When the patient says they need to "reschedule" or "cancel" an appointment:
1. READ the appointment details they provided (date, reason, ID)
2. DO NOT just repeat their message back
3. IMMEDIATELY respond as instructed below:

**IF RESCHEDULE REQUEST** (contains "reschedule" or "need to reschedule"):
- Acknowledge: "I can definitely help you reschedule that appointment"
- Ask directly: "What date and time would work better for you?"
- Wait for their response with preferred date/time
- Once they give you a time, use the reschedule_appointment tool

**IF CANCEL REQUEST** (contains "cancel" or "want to cancel"):
- Acknowledge: "I can help you cancel that appointment"
- Confirm: "Just to confirm, you want to cancel the appointment on [DATE] for [REASON]?"
- Wait for confirmation
- Once they confirm, use the cancel_appointment tool

## ⚠️ CRITICAL: NEVER AUTO-CONFIRM APPOINTMENTS
- If the patient has an upcoming appointment shown in the context, DO NOT assume they are confirming it or modifying it based on casual greetings like "hello" or "hi"
- ONLY book or modify appointments if the patient explicitly requests to do so
- When showing upcoming appointments, ask if they want to keep, reschedule, or cancel them
- Generic messages like "hello" are NOT confirmation to book or modify anything

## YOUR PERSONALITY & APPROACH:
- Talk naturally and conversationally, like a caring human secretary
- Be warm, empathetic, and professional
- Ask clarifying questions - don't assume or rush
- Remember context from earlier in the conversation
- Show genuine interest in the patient's well-being
- Use the patient's name when appropriate

## YOUR CORE RESPONSIBILITIES:

### 1. PRE-VISIT SCHEDULING (Your Main Role)
When a patient wants to book an appointment, have a DISCUSSION with them:

**Step 1: CHECK OPEN TASKS FIRST (VERY IMPORTANT)**
- ALWAYS start by checking if the patient has open tasks/doctor's orders
- If they have open tasks (labs, tests, prescriptions, follow-ups), PROACTIVELY ask about them:
  * "Hi [Name]! Before we schedule anything, I noticed Dr. [Name] asked you to [complete blood tests/get an MRI/etc.]. Have you had a chance to do that yet?"
  * If they completed it: "Great! Do you have the results with you? You can upload them here and I'll add them to your file for the doctor to review."
  * If they haven't completed it: "No problem. Would you like to complete that before your next appointment, or is this visit about something different?"
- This is CRITICAL for follow-up appointments - we need to track task completion!

**Step 2: Understand the Visit Context**
- Ask if this is a new issue, follow-up from a previous visit, or a routine check-up
- If they have a visit history, reference it: "I see you visited us last month for [reason]. Is this related to that, or something new?"

**Step 3: Assess the Situation**
- Ask about their symptoms, concerns, or reason for visit
- Inquire about severity, duration, and impact on daily life
- Show empathy: "That sounds really difficult. I'm so sorry you're dealing with this."
- Internally assess urgency/priority (1-10 scale) based on:
  - Severity of symptoms
  - Duration and progression
  - Impact on quality of life
  - Patient's anxiety level
  - Medical history (chronic conditions, risk factors)

**Step 4: Discuss Appointment Type**
- Explain available appointment types (e.g., "We have check-ups which are 20 minutes, or new patient visits which are 40 minutes")
- Recommend the appropriate type based on their needs
- Mention the duration so they can plan their day

**Step 5: Find Mutual Available Time**
- Ask about their availability: "What days and times work best for you this week?"
- CRITICAL: You MUST check each time slot using check_availability tool BEFORE mentioning it to the patient!
- NEVER suggest times without checking first - always verify availability before offering options
- Example workflow:
  1. Patient says "I want to come on November 13th"
  2. You check: check_availability("2025-11-13T07:00:00Z", 30) for 9 AM
  3. You check: check_availability("2025-11-13T08:00:00Z", 30) for 10 AM
  4. You check: check_availability("2025-11-13T09:00:00Z", 30) for 11 AM
  5. ONLY after checking, you say "I have 9 AM and 11 AM available" (skip 10 AM if it was not available)
- If patient requests a specific time, check it immediately before responding
- Consider priority - urgent cases get earlier slots

**Step 6: Pre-Visit Instructions**
- Share doctor-specific or appointment-specific instructions
- Ask if they have any questions about preparation
- Confirm contact info and location

### 2. PROVIDE INFORMATION
- Share clinic location, doctor specialty, office hours
- Summarize patient's medical history when relevant
- List upcoming appointments and open tasks
- Explain processes and what to expect
- **Use the get_doctor_profile tool when patients ask about the doctor** - this fetches live information directly from the doctor's profile

### 2a. DOCTOR INFORMATION - USE THE TOOL
When a patient asks about the doctor, USE THE get_doctor_profile TOOL to retrieve current information:
- If they ask "Tell me about the doctor" or "Who is the doctor?" → USE THE TOOL
- If they ask "What is the doctor's specialty?" → USE THE TOOL
- If they ask "What's the doctor's experience?" or "Tell me about Dr. [Name]'s background" → USE THE TOOL
- If they want to know more about their healthcare provider → USE THE TOOL

After getting the information from the tool, naturally incorporate it into your response:
- Build patient confidence by sharing the doctor's specialty and background
- Example: "Dr. [Name] is our [specialty] specialist. [Include their background]. They have extensive experience helping patients with [relevant expertise]."
- Share the information NATURALLY in conversation, not as a list
- Be warm and professional when introducing the doctor

The tool will return the doctor's name, specialty, and professional background - use this live data to provide accurate, current information.

### 2b. DOCTOR INSTRUCTIONS - USE THE TOOL
When a patient asks about pre-visit instructions, preparation, or what they should do before an appointment, USE THE get_doctor_instructions TOOL:
- If they ask "What should I do before my appointment?" → USE THE TOOL
- If they ask "What instructions do I need to follow?" → USE THE TOOL
- If they ask "What should I prepare for the visit?" → USE THE TOOL
- If they ask "What does the doctor want me to know?" → USE THE TOOL
- PROACTIVELY use this tool in greetings to share doctor's instructions naturally

The tool returns:
- **AI Instructions**: Custom instructions from the doctor for you to share with patients
- **Pre-Visit Notes**: General instructions patients should follow
- **Appointment-Type-Specific Instructions**: Special instructions based on appointment type

When you get the instructions from the tool, present them naturally:
- "Before your appointment, Dr. [Name] recommends: [instructions]"
- Prioritize the most important instructions first
- Be friendly and encouraging: "These are just simple preparations to help us make the most of your visit time"
- Include appointment-type-specific instructions if relevant to their visit

### 3. TRIAGE & PRIORITY
- Assess urgency without alarming the patient
- For emergencies (chest pain, severe bleeding, difficulty breathing), immediately advise calling 911
- For urgent but non-emergency, offer same-day or next-day slots
- For routine, offer convenient scheduling within appropriate timeframe

## IMPORTANT SAFETY GUIDELINES:
- You are NOT a doctor - never diagnose or prescribe
- Never provide specific medical advice
- For concerning symptoms, emphasize importance of seeing the doctor
- Maintain patient privacy and confidentiality
- Be empathetic and supportive, especially with anxious patients

## CONVERSATION STYLE:
- Have a brief, natural conversation before booking (2-4 exchanges is ideal)
- Ask ONE or TWO questions at a time (not a long list)
- Gather: reason for visit, symptoms (if any), preferred time
- Once you have these basics and patient confirms, book the appointment
- Show that you're listening by referencing what they said
- Be conversational: "Got it" "I understand" "That makes sense"
- **INTRODUCE THE DOCTOR NATURALLY**: When greeting a new patient or booking an appointment, work in the doctor's specialty and background. Example opening: "Hi! I'm here to help you get connected with Dr. [Name], who specializes in [specialty] and brings [X years] of experience to patient care."

## BOOKING WORKFLOW (CRITICAL - FOLLOW EXACTLY):

**RULE #1: ALWAYS GET AVAILABLE SLOTS FIRST BEFORE BOOKING**

**Step 1: Gather Information (Conversational)**
- Patient says they want an appointment or provides a specific time
- Ask 1-2 brief questions about reason/symptoms: "What's this appointment for?" "Any symptoms?"
- Patient gives you a date/time OR confirms availability

**Step 2: Fetch Doctor's Available Slots (MANDATORY BEFORE BOOKING)**
When patient says they want: "Tomorrow at 3:30 PM" or "Wednesday afternoon" or any time:
- IMMEDIATELY call check_doctor_availability tool to get REAL available slots
- startDate: ISO date of requested day (e.g., "2025-11-21")
- endDate: ISO date of requested day (e.g., "2025-11-21")
- durationMinutes: 40
- This returns actual available times from doctor's calendar
- Example response: {availableSlots: ["09:00", "10:00", "14:00", "15:00", "16:00"]}

**Step 3: Show Multiple Slots to Patient**
- Display ALL available slots: "I checked Dr. John Smith's calendar for [DAY]. Available times are: 9:00 AM, 10:00 AM, 2:00 PM, 3:00 PM, 4:00 PM"
- If their preferred time is available, highlight it: "Great! 3:30 PM is available!"
- If NOT available, show alternatives

**Step 4: Get Patient's Confirmation**
- Wait for patient to confirm or pick a time from YOUR list
- Examples: "Yes, 3:30 PM works" or "Can I do 2:00 PM instead?"
- ONLY proceed to booking AFTER patient explicitly confirms

**CRITICAL: BOOKING CONFIRMATION TRIGGERS**
When patient says ANY of these (or similar affirmative confirmations), you MUST IMMEDIATELY call book_appointment:
- "Yes, 3:30 PM works" or "3:30 PM is good"
- "Book it" or "Let's book" or "Yes, book that"
- "Confirm" or "Yes, confirm"
- "Let's do it" or "Yes, please"
- "That time works" or "Perfect"
- "Yes" (when referring to a time)
- User says "book it please", "book that for me", "go ahead and book"
- User says "yes" after you show available times

**IF ANY OF THESE OCCUR:**
1. Extract the CONFIRMED time from the conversation (the time the patient agreed to)
2. Extract the reason for visit from earlier in conversation (e.g., "severe headaches")
3. Call book_appointment with:
   - scheduledAt: The exact confirmed time in ISO format
   - visitType: Assess from context ("new_patient", "follow_up", or "urgent")
   - reasonForVisit: From the patient's description
   - priorityScore: 1-10 based on severity (5=moderate, 8=urgent, etc.)
   - symptoms: Patient's symptoms from conversation
   - durationMinutes: 40 for new patients, 30 for routine, 20 for follow-ups
4. DO NOT ask for more information - use what you know from the conversation
5. DO NOT hesitate - call the tool immediately when you see these confirmation words

**Step 5: THEN Book the Appointment (NOW USE book_appointment)**
- Call book_appointment with confirmed time (from step above)
- Parameters: visitType:"new_patient" (or "follow_up"/"urgent"), scheduledAt:"2025-11-21T15:30:00Z", reasonForVisit:"...", priorityScore:5, symptoms:"...", durationMinutes:40
- This creates the actual appointment

**Step 6: Confirm to Patient**
- "Perfect! I've booked your appointment with Dr. [Name] for [DATE] at [TIME]"
- Share any doctor instructions if available
- Friendly close

**⚠️ DO NOT VIOLATE THIS WORKFLOW:**
- ❌ Never book without checking available slots first
- ❌ Never assume a time works - ALWAYS call check_doctor_availability
- ❌ Never book if patient hasn't explicitly confirmed the time
- ❌ Never skip showing options to patient - let them choose

## TOOLS AVAILABLE:
- You can book appointments after gathering: time, reason for visit, basic symptoms
- Don't book immediately - have 2-3 message exchanges first
- You can reschedule existing appointments
- You can cancel appointments when patients request it
- You have access to patient history, medications, allergies, past visits, and open tasks
- When patients complete tasks (labs, tests, etc.), encourage them to upload results via the chat interface

## HANDLING RESCHEDULE REQUESTS:
**WORKFLOW: Ask → Fetch Availability → Show Slots → Confirm → Reschedule**

When a patient tells you they want to reschedule an appointment:
1. Acknowledge their request: "I can definitely help you reschedule that appointment"
2. Ask when they'd prefer: "What date and time would work better for you?"
3. Wait for their response (patient may say just a day, or a day with time)

**Once patient provides a date/day:**
4. **IMMEDIATELY fetch all available slots for that day** using check_doctor_availability:
   - If patient says "Wednesday at 3 PM" → query the entire Wednesday
   - If patient says just "Wednesday" → query the entire Wednesday
   - Use date range: start and end of that specific day (e.g., "2025-11-19" to "2025-11-19")
   - Use durationMinutes: 40 (or match original appointment duration)
   - This checks doctor's Google Calendar and shows real available slots

5. **Show all available slots to the patient:**
   - List them naturally: "I checked Dr. [Name]'s calendar for Wednesday. Here are the available times: 10 AM, 11 AM, 12 PM, 2 PM, 3 PM, 4 PM"
   - Let patient see their options clearly
   - If their suggested time is in the list, highlight it: "Great! 3 PM is available!"

6. **Wait for patient confirmation:**
   - Patient confirms or picks from the available slots
   - Example: "Perfect, 3 PM works for me" or "Can I do 2 PM instead?"

7. **Reschedule with confirmed time:**
   - Use reschedule_appointment tool with:
     * appointmentId: The ID of their existing appointment (from patient context)
     * newScheduledAt: The exact ISO 8601 datetime they confirmed (e.g., "2025-11-19T15:00:00Z")
   - Confirm: "Perfect! I've rescheduled your appointment to Wednesday at 3 PM"

8. IMPORTANT: When the tool returns with appointment AND doctorInstructions:
   - Share the instructions naturally: "Before your appointment, Dr. [Name] recommends: [instructions]"
   - Include this in your confirmation message
   - Emphasize any important preparation needed

**WORKFLOW EXAMPLE:**
- Patient: "I need to reschedule my appointment"
- YOU: "What date and time would work better for you?"
- Patient: "Wednesday at 3 PM"
- YOU: [call check_doctor_availability for all of Wednesday]
- YOU: "Great! I checked Wednesday's availability. Here are the open times: 10 AM, 11 AM, 12 PM, 2 PM, 3 PM, 4 PM"
- Patient: "3 PM is perfect"
- YOU: [call reschedule_appointment for Wednesday 3 PM]
- YOU: "Perfect! I've rescheduled your appointment to Wednesday at 3 PM"

## HANDLING CANCEL REQUESTS:
When a patient tells you they want to cancel an appointment:
1. Acknowledge their request: "I can help you cancel that appointment"
2. Confirm if they're sure: "Just to confirm, you want to cancel the appointment on [date/time] for [reason]?"
3. Once they confirm, use the cancel_appointment tool with:
   - The appointment ID (from the patient's message or context)
4. Confirm the cancellation: "Done! I've canceled your appointment. If you need to schedule another one in the future, just let me know"

## MANAGING PATIENT FILES:
**YOU NOW HAVE ACCESS TO PATIENT'S UPLOADED FILES IN THE CONTEXT**
- The patient context includes all their uploaded medical files (lab results, imaging, prescriptions, etc.)
- Files show: name, category, upload date, review status, doctor's feedback, and AI summaries
- Use this information naturally in conversations:
  * Reference their files: "I see you uploaded those lab results last week - did the doctor already review those with you?"
  * Acknowledge file receipt: "Thanks for uploading that! The doctor will review it before your appointment."
  * Reference doctor feedback: "I see Dr. [Name] left some comments on your imaging file - would you like to discuss those?"
  * Help clarify findings: "Your recent lab results show some variation - the doctor will walk you through what that means"

**FILE VISIBILITY & FEEDBACK:**
- Patients can see doctor's comments and annotations on their files
- If patient asks about a file's status, check if it says "REVIEWED" or "PENDING"
- Example: "Your blood work was reviewed on [date]. The doctor found [AI summary or comments]."
- If files are pending review, reassure: "The doctor should review that soon - I'll make sure they see it."

**TOOLS FOR FILE MANAGEMENT:**
Available file management tools:
- list_my_files: Show all patient's uploaded files with status and doctor feedback
- get_file_details: Get detailed info about a specific file including doctor's comments and annotations
- delete_patient_file: Help patient remove a file (soft delete, recoverable for 90 days)

**WHEN TO USE FILE TOOLS:**
- Patient asks "What files have I uploaded?" → Use list_my_files
- Patient asks "What did the doctor say about my results?" → Use get_file_details
- Patient wants to remove a file → Use delete_patient_file
- When reviewing patient's medical history, proactively mention their recent files

## DOCUMENT UPLOAD WORKFLOW:
- When a patient says they completed a task (blood test, MRI, X-ray, etc.), respond enthusiastically
- Tell them: "Great! You can upload the results right here in the chat. Just click the upload button and attach the file - I'll make sure the doctor sees it before your appointment."
- Explain file categories: Lab results, medical imaging, prescriptions, insurance docs, ID documents, etc.
- After upload, confirm: "Thanks for uploading that [file type]! The doctor will review it and may have comments before your appointment."
- Emphasize that uploading helps the doctor prepare and saves time during the visit
- Be supportive: "No worries if you don't have it now - you can always upload it later or bring it to your appointment."
- If patient has pending files waiting for doctor review, acknowledge: "I see you have some files waiting for review - the doctor will get to those soon"

Remember: You're a secretary, not a bot. Have real conversations. Build rapport. Care about the patients.`;

// Helper functions - declared before main function to avoid hoisting issues

// Check if a time slot is available without booking
async function checkAvailability(
  scheduledAt: string,
  durationMinutes: number
): Promise<{ available: boolean; conflictReason?: string }> {
  try {
    const appointmentTime = new Date(scheduledAt) as Date;
    const appointmentEnd = new Date(appointmentTime.getTime() + durationMinutes * 60000) as Date;

    // Get provider (prefer one with calendar connected)
    let provider = await prisma.provider.findFirst({
      where: {
        calendarConnected: true,
      },
      select: {
        id: true,
        calendarConnected: true,
      },
    });

    // If no doctor with calendar, get any doctor
    if (!provider) {
      provider = await prisma.provider.findFirst({
        select: {
          id: true,
          calendarConnected: true,
        },
      });
    }

    if (!provider) {
      return { available: false, conflictReason: 'No doctor available' };
    }

    const providerId = provider.id;

    // Check for conflicts with existing appointments in database
    const conflictingAppointments = await prisma.visit.findMany({
      where: {
        providerId,
        status: {
          in: ['SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS'],
        },
        scheduledAt: {
          gte: new Date(appointmentTime.getTime() - durationMinutes * 60000),
          lte: new Date(appointmentTime.getTime() + durationMinutes * 60000),
        },
      },
    });

    if (conflictingAppointments.length > 0) {
      return {
        available: false,
        conflictReason: `Already have an appointment at ${appointmentTime.toLocaleString('en-US', { timeZone: 'Asia/Beirut' })} Beirut time`,
      };
    }

    // Check for conflicts with Google Calendar events if calendar is connected
    if (provider.calendarConnected) {
      try {
        const { getCalendarEvents } = await import('./googleCalendarService');

        // Get calendar events for the ENTIRE DAY to catch all events (not just overlapping window)
        const dayStart = new Date(appointmentTime!);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(appointmentTime!);
        dayEnd.setHours(23, 59, 59, 999);

        const calendarEvents = await getCalendarEvents(providerId, dayStart, dayEnd);

        // Check if any calendar event conflicts with the requested time slot
        const conflictingEvent = calendarEvents.find((event) => {
          if (!event.start || !event.end) return false;
          const eventStart = new Date(event.start);
          const eventEnd = new Date(event.end);
          return (appointmentTime < eventEnd && appointmentEnd > eventStart);
        });

        if (conflictingEvent) {
          return {
            available: false,
            conflictReason: `Doctor has another commitment in their calendar at that time`,
          };
        }

        console.log(`✅ Time slot ${appointmentTime.toISOString()} is available`);
      } catch (error: any) {
        console.error('⚠️ Failed to check calendar conflicts:', error.message);
        // If calendar check fails, still return available (don't block on calendar errors)
      }
    }

    return { available: true };
  } catch (error: any) {
    console.error('Error checking availability:', error);
    return { available: false, conflictReason: 'Error checking availability' };
  }
}

async function bookAppointmentForPatient(
  patientId: string,
  args: {
    scheduledAt: string;
    visitType: string;
    reasonForVisit: string;
    symptoms?: string;
    priorityScore?: number;
    durationMinutes?: number;
  }
) {
  // Use provided priority score or calculate it
  let priorityScore = args.priorityScore || 5;
  if (!args.priorityScore) {
    const { calculatePriorityScore } = await import('./priorityScoring');
    priorityScore = calculatePriorityScore(args.symptoms || args.reasonForVisit);
  }

  // Use provided duration or default to 30
  const durationMinutes = args.durationMinutes || 30;

  // Get the first doctor with calendar connected (in production, this should be selected based on specialty/availability)
  let provider = await prisma.provider.findFirst({
    where: {
      calendarConnected: true,
    },
    select: {
      id: true,
      calendarConnected: true,
      calendarProvider: true,
      firstName: true,
      lastName: true,
      clinicAddress: true,
      clinicCity: true,
      clinicCountry: true,
    },
  });

  // If no doctor with calendar, get any doctor
  if (!provider) {
    provider = await prisma.provider.findFirst({
      select: {
        id: true,
        calendarConnected: true,
        calendarProvider: true,
        firstName: true,
        lastName: true,
        clinicAddress: true,
        clinicCity: true,
        clinicCountry: true,
      },
    });
  }

  if (!provider) {
    throw new Error('No doctor available');
  }

  // At this point, provider is guaranteed to be non-null
  const providerId = provider.id;
  const { calendarConnected, clinicAddress, clinicCity, clinicCountry } = provider;

  const scheduledAt = new Date(args.scheduledAt);
  const appointmentEnd = new Date(scheduledAt.getTime() + durationMinutes * 60000);

  // Check for conflicts with existing appointments in database
  const conflictingAppointments = await prisma.visit.findMany({
    where: {
      providerId,
      status: {
        in: ['SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS'],
      },
      scheduledAt: {
        gte: new Date(scheduledAt.getTime() - durationMinutes * 60000),
        lte: new Date(scheduledAt.getTime() + durationMinutes * 60000),
      },
    },
  });

  if (conflictingAppointments.length > 0) {
    throw new Error(
      `Time slot not available. There is already an appointment scheduled at ${scheduledAt.toLocaleString()}. Please choose a different time.`
    );
  }

  // Check for conflicts with Google Calendar events if calendar is connected
  if (calendarConnected) {
    try {
      const { getCalendarEvents } = await import('./googleCalendarService');

      // Get calendar events for the appointment time window
      const calendarStartTime = new Date(scheduledAt.getTime() - 60 * 60000); // 1 hour before
      const calendarEndTime = new Date(scheduledAt.getTime() + durationMinutes * 60000 + 60 * 60000); // 1 hour after

      const calendarEvents = await getCalendarEvents(providerId, calendarStartTime, calendarEndTime);

      // Check if any calendar event conflicts with the requested time slot
      const hasCalendarConflict = calendarEvents.some((event) => {
        // Check if there's an overlap between the appointment and calendar event
        if (!event.start || !event.end) return false;
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        return (scheduledAt < eventEnd && appointmentEnd > eventStart);
      });

      if (hasCalendarConflict) {
        throw new Error(
          `Time slot not available. The doctor has another commitment at ${scheduledAt.toLocaleString()} in their calendar. Please choose a different time.`
        );
      }

      console.log(`✅ No calendar conflicts found for ${scheduledAt.toISOString()}`);
    } catch (error: any) {
      console.error('⚠️ Failed to check calendar conflicts:', error.message);
      // If it's a conflict error, throw it
      if (error.message.includes('not available')) {
        throw error;
      }
      // Otherwise, log the error but continue (don't block booking if calendar check fails)
    }
  }

  // Get patient info for calendar event
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { firstName: true, lastName: true, email: true },
  });

  // Create the appointment in database
  const visit = await prisma.visit.create({
    data: {
      patientId,
      providerId,
      scheduledAt,
      status: 'SCHEDULED',
      visitType: args.visitType,
      reasonForVisit: args.reasonForVisit,
      durationMinutes,
      priorityScore,
      hpiDraft: args.symptoms,
    },
  });

  // Create Google Calendar event if calendar is connected
  console.log(`📅 Calendar connected: ${calendarConnected}, Has patient: ${!!patient}`);
  if (calendarConnected && patient) {
    try {
      console.log(`🔄 Attempting to create Google Calendar event...`);
      console.log(`   Provider ID: ${providerId}`);
      console.log(`   Scheduled at: ${scheduledAt.toISOString()}`);
      console.log(`   Duration: ${durationMinutes} minutes`);

      const { createCalendarEvent } = await import('./googleCalendarService');
      const endTime = new Date(scheduledAt.getTime() + durationMinutes * 60000);

      const eventData = {
        summary: `${args.visitType}: ${patient.firstName} ${patient.lastName}`,
        description: `Reason: ${args.reasonForVisit}\nPriority: ${priorityScore}/10${args.symptoms ? `\nSymptoms: ${args.symptoms}` : ''}`,
        start: scheduledAt,
        end: endTime,
        attendees: patient.email ? [patient.email] : [],
        location: clinicAddress ? `${clinicAddress}, ${clinicCity}, ${clinicCountry}` : undefined,
      };

      console.log(`   Event data:`, JSON.stringify(eventData, null, 2));

      const calendarEvent = await createCalendarEvent(providerId, eventData);

      console.log(`✅ Calendar event created successfully! Event ID: ${calendarEvent.id}`);

      // Store the calendar event ID
      await prisma.visit.update({
        where: { id: visit.id },
        data: { calendarEventId: calendarEvent.id },
      });

      console.log(`✅ Appointment added to Google Calendar for ${patient.firstName} ${patient.lastName} (Event ID: ${calendarEvent.id})`);
    } catch (error: any) {
      console.error('⚠️ Failed to add appointment to Google Calendar:');
      console.error('   Error name:', error.name);
      console.error('   Error message:', error.message);
      console.error('   Full error:', error);
      // Don't throw - appointment is still created in database
    }
  } else {
    console.log(`⚠️ Skipping calendar event creation - Calendar connected: ${calendarConnected}, Has patient: ${!!patient}`);
  }

  // Create audit log
  await prisma.auditLog.create({
    data: {
      actorType: 'ai',
      actorId: 'system',
      action: 'create',
      resourceType: 'visit',
      resourceId: visit.id,
      metadata: { visitType: args.visitType, reasonForVisit: args.reasonForVisit, priorityScore },
      rationale: 'AI assistant booked appointment',
    },
  });

  return visit;
}

async function rescheduleAppointmentForPatient(
  appointmentId: string,
  newScheduledAt: string
) {
  const scheduledAt = new Date(newScheduledAt);

  // Get the existing appointment with patient and provider info
  const existingAppointment = await prisma.visit.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { select: { firstName: true, lastName: true, email: true } },
      provider: { select: { id: true, calendarConnected: true, clinicAddress: true, clinicCity: true, clinicCountry: true } },
    },
  });

  if (!existingAppointment) {
    throw new Error('Appointment not found');
  }

  const durationMinutes = existingAppointment.durationMinutes || 30;

  // Check for conflicts with other appointments (excluding this one)
  const conflictingAppointments = await prisma.visit.findMany({
    where: {
      providerId: existingAppointment.providerId,
      id: { not: appointmentId }, // Exclude the appointment being rescheduled
      status: {
        in: ['SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS'],
      },
      scheduledAt: {
        gte: new Date(scheduledAt.getTime() - durationMinutes * 60000),
        lte: new Date(scheduledAt.getTime() + durationMinutes * 60000),
      },
    },
  });

  if (conflictingAppointments.length > 0) {
    throw new Error(
      `Time slot not available. There is already an appointment scheduled at ${scheduledAt.toLocaleString()}. Please choose a different time.`
    );
  }

  // Update the appointment in database
  const updatedVisit = await prisma.visit.update({
    where: { id: appointmentId },
    data: {
      scheduledAt,
    },
  });

  // Update Google Calendar event if calendar is connected and event ID exists
  if (existingAppointment.provider?.calendarConnected && existingAppointment.calendarEventId && existingAppointment.patient) {
    try {
      const { updateCalendarEvent } = await import('./googleCalendarService');
      const endTime = new Date(scheduledAt.getTime() + durationMinutes * 60000);

      await updateCalendarEvent(
        existingAppointment.providerId!,
        existingAppointment.calendarEventId,
        {
          summary: `${existingAppointment.visitType}: ${existingAppointment.patient.firstName} ${existingAppointment.patient.lastName}`,
          description: `Reason: ${existingAppointment.reasonForVisit}\nRescheduled appointment`,
          start: scheduledAt,
          end: endTime,
          attendees: existingAppointment.patient.email ? [existingAppointment.patient.email] : [],
          location: existingAppointment.provider.clinicAddress ? `${existingAppointment.provider.clinicAddress}, ${existingAppointment.provider.clinicCity}, ${existingAppointment.provider.clinicCountry}` : undefined,
        }
      );

      console.log(`✅ Calendar event updated for rescheduled appointment: ${existingAppointment.calendarEventId}`);
    } catch (error) {
      console.error('⚠️ Failed to update calendar event for rescheduled appointment:', error);
      // Don't throw - appointment is still rescheduled in database
    }
  }

  // Create audit log
  await prisma.auditLog.create({
    data: {
      actorType: 'ai',
      actorId: 'system',
      action: 'update',
      resourceType: 'visit',
      resourceId: updatedVisit.id,
      metadata: {
        oldScheduledAt: existingAppointment.scheduledAt,
        newScheduledAt: scheduledAt
      },
      rationale: 'AI assistant rescheduled appointment',
    },
  });

  return updatedVisit;
}

async function cancelAppointmentForPatient(appointmentId: string) {
  // Get the existing appointment with provider info
  const existingAppointment = await prisma.visit.findUnique({
    where: { id: appointmentId },
    include: {
      provider: { select: { id: true, calendarConnected: true } },
    },
  });

  if (!existingAppointment) {
    throw new Error('Appointment not found');
  }

  // Cancel the appointment in database
  const updatedVisit = await prisma.visit.update({
    where: { id: appointmentId },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
    },
  });

  // Delete Google Calendar event if calendar is connected and event ID exists
  if (existingAppointment.provider?.calendarConnected && existingAppointment.calendarEventId) {
    try {
      const { deleteCalendarEvent } = await import('./googleCalendarService');
      await deleteCalendarEvent(existingAppointment.providerId!, existingAppointment.calendarEventId);
      console.log(`✅ Calendar event deleted for cancelled appointment: ${existingAppointment.calendarEventId}`);
    } catch (error) {
      console.error('⚠️ Failed to delete calendar event for cancelled appointment:', error);
      // Don't throw - appointment is still cancelled in database
    }
  }

  // Create audit log
  await prisma.auditLog.create({
    data: {
      actorType: 'ai',
      actorId: 'system',
      action: 'update',
      resourceType: 'visit',
      resourceId: appointmentId,
      metadata: { action: 'cancelled_by_ai_assistant' },
      rationale: 'AI assistant cancelled appointment at patient request',
    },
  });

  return updatedVisit;
}

async function markTaskAsCompleted(taskId: string, notes?: string) {
  // Get the existing task to verify it exists
  const existingTask = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!existingTask) {
    throw new Error('Task not found');
  }

  // Mark task as completed
  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      ...(notes && { notes }),
    },
  });

  // Create audit log
  await prisma.auditLog.create({
    data: {
      actorType: 'ai',
      actorId: 'system',
      action: 'update',
      resourceType: 'task',
      resourceId: taskId,
      metadata: {
        action: 'marked_completed_by_ai',
        notes: notes || 'Task marked as completed by patient via AI assistant'
      },
      rationale: 'AI assistant marked task as completed after patient confirmation',
    },
  });

  return updatedTask;
}

async function getDoctorProfileInfo(patientId: string) {
  try {
    // Get patient to find their doctor
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) {
      throw new Error('Patient not found');
    }

    // Get upcoming visits to find the doctor
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const upcomingVisits = await prisma.visit.findMany({
      where: {
        patientId,
        status: 'SCHEDULED',
        scheduledAt: { gte: twoHoursAgo },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 1,
    });

    // If no upcoming visits, try to get the doctor from recent visits
    let doctorId: string | null = null;
    if (upcomingVisits.length > 0 && upcomingVisits[0].providerId) {
      doctorId = upcomingVisits[0].providerId;
    } else {
      // Get recent visits to find doctor
      const recentVisits = await prisma.visit.findMany({
        where: {
          patientId,
          status: 'COMPLETED',
        },
        orderBy: { completedAt: 'desc' },
        take: 1,
      });

      if (recentVisits.length > 0 && recentVisits[0].providerId) {
        doctorId = recentVisits[0].providerId;
      }
    }

    // If we found a doctor, get their profile
    if (doctorId) {
      const doctor = await prisma.provider.findUnique({
        where: { id: doctorId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          specialty: true,
          profileDescription: true,
        },
      });

      if (doctor) {
        console.log(`🎯 Retrieved doctor profile for ${doctor.firstName} ${doctor.lastName}`);
        return {
          success: true,
          doctor: {
            name: `${doctor.firstName} ${doctor.lastName}`,
            specialty: doctor.specialty || 'General Practice',
            profileDescription: doctor.profileDescription || 'No additional information available',
          },
        };
      }
    }

    // If no doctor found via appointments, get the first doctor in system
    const defaultDoctor = await prisma.provider.findFirst({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        specialty: true,
        profileDescription: true,
      },
    });

    if (defaultDoctor) {
      console.log(`🎯 Retrieved default doctor profile: ${defaultDoctor.firstName} ${defaultDoctor.lastName}`);
      return {
        success: true,
        doctor: {
          name: `${defaultDoctor.firstName} ${defaultDoctor.lastName}`,
          specialty: defaultDoctor.specialty || 'General Practice',
          profileDescription: defaultDoctor.profileDescription || 'No additional information available',
        },
      };
    }

    return {
      success: false,
      error: 'No doctor information available',
    };
  } catch (error: any) {
    console.error('❌ Error retrieving doctor profile:', error.message);
    return {
      success: false,
      error: error.message || 'Unable to retrieve doctor information',
    };
  }
}

async function getDoctorInstructions(patientId: string) {
  try {
    // Get patient to find their doctor
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) {
      throw new Error('Patient not found');
    }

    // Get upcoming visits to find the doctor
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const upcomingVisits = await prisma.visit.findMany({
      where: {
        patientId,
        status: 'SCHEDULED',
        scheduledAt: { gte: twoHoursAgo },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 1,
    });

    // If no upcoming visits, try to get the doctor from recent visits
    let doctorId: string | null = null;
    if (upcomingVisits.length > 0 && upcomingVisits[0].providerId) {
      doctorId = upcomingVisits[0].providerId;
    } else {
      // Get recent visits to find doctor
      const recentVisits = await prisma.visit.findMany({
        where: {
          patientId,
          status: 'COMPLETED',
        },
        orderBy: { completedAt: 'desc' },
        take: 1,
      });

      if (recentVisits.length > 0 && recentVisits[0].providerId) {
        doctorId = recentVisits[0].providerId;
      }
    }

    // If we found a doctor, get their instructions
    if (doctorId) {
      const doctor = await prisma.provider.findUnique({
        where: { id: doctorId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          aiInstructions: true,
          preVisitNotes: true,
          appointmentTypes: {
            select: {
              name: true,
              code: true,
              preVisitInstructions: true,
            },
          },
        },
      });

      if (doctor) {
        console.log(`🎯 Retrieved doctor instructions for ${doctor.firstName} ${doctor.lastName}`);
        return {
          success: true,
          instructions: {
            doctorName: `${doctor.firstName} ${doctor.lastName}`,
            aiInstructions: doctor.aiInstructions || 'No custom AI instructions available',
            preVisitNotes: doctor.preVisitNotes || 'No general pre-visit instructions available',
            appointmentTypeInstructions: doctor.appointmentTypes.map((type: any) => ({
              appointmentType: type.name,
              instructions: type.preVisitInstructions || 'No specific instructions for this appointment type',
            })) || [],
          },
        };
      }
    }

    // If no doctor found via appointments, get the first doctor in system
    const defaultDoctor = await prisma.provider.findFirst({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        aiInstructions: true,
        preVisitNotes: true,
        appointmentTypes: {
          select: {
            name: true,
            code: true,
            preVisitInstructions: true,
          },
        },
      },
    });

    if (defaultDoctor) {
      console.log(`🎯 Retrieved default doctor instructions: ${defaultDoctor.firstName} ${defaultDoctor.lastName}`);
      return {
        success: true,
        instructions: {
          doctorName: `${defaultDoctor.firstName} ${defaultDoctor.lastName}`,
          aiInstructions: defaultDoctor.aiInstructions || 'No custom AI instructions available',
          preVisitNotes: defaultDoctor.preVisitNotes || 'No general pre-visit instructions available',
          appointmentTypeInstructions: defaultDoctor.appointmentTypes.map((type: any) => ({
            appointmentType: type.name,
            instructions: type.preVisitInstructions || 'No specific instructions for this appointment type',
          })) || [],
        },
      };
    }

    return {
      success: false,
      error: 'No doctor instructions available',
    };
  } catch (error: any) {
    console.error('❌ Error retrieving doctor instructions:', error.message);
    return {
      success: false,
      error: error.message || 'Unable to retrieve doctor instructions',
    };
  }
}

async function getDoctorSettings(patientId: string): Promise<any> {
  try {
    // Get the patient's doctor (from upcoming appointment, then recent, then default)
    const upcomingVisit = await prisma.visit.findFirst({
      where: {
        patientId,
        status: 'SCHEDULED',
        scheduledAt: { gte: new Date() },
      },
      select: { providerId: true },
    });

    let doctor = null;

    if (upcomingVisit?.providerId) {
      doctor = await prisma.provider.findUnique({
        where: { id: upcomingVisit.providerId },
        include: { appointmentTypes: true },
      });
    } else {
      // Try recent visits
      const recentVisit = await prisma.visit.findFirst({
        where: { patientId },
        orderBy: { completedAt: 'desc' },
        select: { providerId: true },
      });

      if (recentVisit?.providerId) {
        doctor = await prisma.provider.findUnique({
          where: { id: recentVisit.providerId },
          include: { appointmentTypes: true },
        });
      }
    }

    // If no doctor found via patient visits, get the first doctor
    if (!doctor) {
      doctor = await prisma.provider.findFirst({
        include: { appointmentTypes: true },
      });
    }

    if (!doctor) {
      return {
        success: false,
        error: 'No doctor found in the system',
      };
    }

    console.log(`📋 Retrieved complete settings for Dr. ${doctor.firstName} ${doctor.lastName}`);

    // Format working hours for display
    const workingHoursFormatted = (doctor.workingHours as any) || {};

    // Format appointment types
    const appointmentTypesFormatted = doctor.appointmentTypes.map((type: any) => ({
      name: type.name,
      code: type.code,
      duration: type.duration,
      description: type.description,
      preVisitInstructions: type.preVisitInstructions,
    }));

    return {
      success: true,
      settings: {
        profile: {
          name: `Dr. ${doctor.firstName} ${doctor.lastName}`,
          specialty: doctor.specialty || 'Not specified',
          licenseNumber: doctor.licenseNumber || 'Not available',
          profileDescription: doctor.profileDescription || 'No professional background information available',
        },
        clinic: {
          name: doctor.clinicName || 'Not specified',
          address: doctor.clinicAddress || 'Not specified',
          city: doctor.clinicCity || 'Not specified',
          country: doctor.clinicCountry || 'Not specified',
          phone: doctor.clinicPhone || 'Not specified',
        },
        location: {
          details: doctor.locationDetails || 'No specific location details available',
        },
        calendar: {
          provider: doctor.calendarProvider || 'Not connected',
          isConnected: doctor.calendarConnected,
          email: doctor.calendarEmail || 'N/A',
          timezone: doctor.timezone || 'UTC',
          lastSync: doctor.calendarLastSyncAt ? new Date(doctor.calendarLastSyncAt).toLocaleString() : 'Never',
        },
        schedule: {
          workingHours: workingHoursFormatted,
          bufferBeforeAppointment: `${doctor.bufferBefore || 5} minutes`,
          bufferAfterAppointment: `${doctor.bufferAfter || 5} minutes`,
          timezone: doctor.timezone || 'UTC',
        },
        aiConfiguration: {
          aiInstructions: doctor.aiInstructions || 'No custom AI instructions configured',
          preVisitNotes: doctor.preVisitNotes || 'No general pre-visit instructions',
        },
        appointmentTypes: appointmentTypesFormatted,
      },
    };
  } catch (error: any) {
    console.error('❌ Error retrieving doctor settings:', error.message);
    return {
      success: false,
      error: error.message || 'Unable to retrieve doctor settings',
    };
  }
}

async function getDoctorAvailableSlots(
  dateRange: { startDate: string; endDate: string },
  durationMinutes: number = 30,
  patientId?: string
): Promise<any> {
  // Parse dates properly - startDate/endDate are in YYYY-MM-DD format
  const [startYear, startMonth, startDay] = dateRange.startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = dateRange.endDate.split('-').map(Number);

  const startDate = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
  const endDate = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

  // Get the patient's doctor (from their upcoming appointments) or best available doctor
  let provider = null;

  if (patientId) {
    // Try to get doctor from patient's upcoming appointment
    const upcomingVisit = await prisma.visit.findFirst({
      where: {
        patientId,
        status: 'SCHEDULED',
        scheduledAt: { gte: new Date() }
      },
      select: { providerId: true },
    });

    if (upcomingVisit && upcomingVisit.providerId) {
      provider = await prisma.provider.findUnique({
        where: { id: upcomingVisit.providerId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          calendarConnected: true,
          timezone: true,
        },
      });
    }
  }

  // If no patient doctor found, get the first doctor with calendar connected
  if (!provider) {
    provider = await prisma.provider.findFirst({
      where: { calendarConnected: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        calendarConnected: true,
        timezone: true,
      },
    });
  }

  // If still no provider, get any doctor
  if (!provider) {
    provider = await prisma.provider.findFirst({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        calendarConnected: true,
        timezone: true,
      },
    });
  }

  if (!provider) {
    throw new Error('No doctor available');
  }

  console.log(`\n🔍 GENERATING AVAILABLE SLOTS FOR DOCTOR ${provider.id}`);
  console.log(`   Doctor Timezone: ${provider.timezone}`);
  console.log(`   Query date range: ${startDate.toDateString()} to ${endDate.toDateString()}`);
  console.log(`   Calendar connected: ${provider.calendarConnected}`);

  // Get all existing appointments in the date range (from database)
  const existingAppointments = await prisma.visit.findMany({
    where: {
      providerId: provider.id,
      status: { in: ['SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS'] },
      scheduledAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  console.log(`   Database appointments: ${existingAppointments.length}`);

  // Get calendar events if calendar is connected
  let calendarEvents: any[] = [];
  if (provider.calendarConnected) {
    try {
      const { getCalendarEvents } = await import('./googleCalendarService');
      const events = await getCalendarEvents(provider.id, startDate, endDate);

      console.log(`\n📅 RAW EVENTS FROM GOOGLE CALENDAR (${events.length} total):`);
      events.forEach((event: any, i: number) => {
        console.log(`   ${i+1}. "${event.summary}": ${event.start} → ${event.end}`);
      });

      calendarEvents = events.map((event: any) => ({
        start: new Date(event.start),
        end: new Date(event.end),
        summary: event.summary,
      }));

      console.log(`\n📅 CONVERTED TO UTC (${calendarEvents.length} total):`);
      calendarEvents.forEach((event) => {
        console.log(`   "${event.summary}": ${event.start.toISOString()} → ${event.end.toISOString()}`);
      });
    } catch (error: any) {
      console.error('⚠️ Error fetching calendar events:', error.message);
      console.log('   ⚠️ Continuing without Google Calendar - showing only database conflicts');
      // Continue without calendar events if there's an error
    }
  } else {
    console.log(`   ⚠️ Calendar NOT connected - showing only database conflicts`);
  }

  // Generate available slots
  const availableSlots: any[] = [];
  const current = new Date(startDate);

  console.log(`\n📋 CHECKING AVAILABILITY (9 AM - 5 PM, Monday-Friday):\n`);

  // Get current time in UTC
  const now = new Date();

  while (current <= endDate) {
    // Only weekdays
    const dayOfWeek = current.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const dayStr = current.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      console.log(`   ${dayStr}:`);

      // 9 AM to 5 PM Beirut time
      for (let hour = 9; hour < 17; hour++) {
        for (let minute = 0; minute < 60; minute += durationMinutes) {
          // Create slot time in UTC by converting from Beirut time (UTC+2)
          // Hour is in Beirut time, so we need to subtract 2 hours to get UTC
          const slotStart = new Date(Date.UTC(
            current.getFullYear(),
            current.getMonth(),
            current.getDate(),
            hour - 2, // Convert Beirut time to UTC (Beirut is UTC+2)
            minute,
            0,
            0
          ));

          const slotEnd = new Date(slotStart);
          slotEnd.setMinutes(slotEnd.getMinutes() + durationMinutes);

          // Check if slot is in the past
          if (slotStart <= now) {
            continue;
          }

          // Check if slot conflicts with database appointments
          const hasDbConflict = existingAppointments.some((appt) => {
            const apptStart = new Date(appt.scheduledAt);
            const apptEnd = new Date(apptStart.getTime() + (appt.durationMinutes || 30) * 60000);
            return (slotStart < apptEnd && slotEnd > apptStart);
          });

          if (hasDbConflict) {
            continue; // Skip this slot
          }

          // Check if slot conflicts with Google Calendar events
          const hasCalendarConflict = calendarEvents.some((event) => {
            const eventStart = event.start; // Already a Date object in UTC
            const eventEnd = event.end; // Already a Date object in UTC
            return (slotStart < eventEnd && slotEnd > eventStart);
          });

          if (hasCalendarConflict) {
            // Find which event is blocking
            const blockingEvent = calendarEvents.find((event) => {
              return (slotStart < event.end && slotEnd > event.start);
            });
            console.log(`      ❌ ${slotStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - BLOCKED by "${blockingEvent?.summary}"`);
            continue;
          }

          // Slot is available!
          availableSlots.push({
            dateTime: slotStart.toISOString(),
            displayTime: slotStart.toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            }),
          });

          console.log(`      ✅ ${slotStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - AVAILABLE`);
        }
      }
    }
    current.setDate(current.getDate() + 1);
  }

  console.log(`\n📊 SUMMARY: Found ${availableSlots.length} available slots\n`);

  return {
    doctorName: `Dr. ${provider.firstName} ${provider.lastName}`,
    calendarConnected: provider.calendarConnected,
    availableSlots: availableSlots.slice(0, 20), // Return max 20 slots
  };
}

async function getPatientContext(patientId: string): Promise<string> {
  try {
    // Get patient profile
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        clinicalProfile: true,
      },
    });

    if (!patient) {
      return 'Patient information not available.';
    }

    // Get last 3 completed visits for context
    const recentVisits = await prisma.visit.findMany({
      where: {
        patientId,
        status: 'COMPLETED',
        noteApproved: true,
      },
      orderBy: { completedAt: 'desc' },
      take: 3,
    });

    // Get upcoming appointments (only from now onwards, not from the past)
    const now = new Date();
    const upcomingVisits = await prisma.visit.findMany({
      where: {
        patientId,
        status: 'SCHEDULED',
        scheduledAt: { gte: now }, // Only show appointments from now onwards
      },
      orderBy: { scheduledAt: 'asc' },
      take: 3,
    });

    // Determine which doctor to use - from upcoming visit, recent visit, or default to first doctor
    let doctorId: string | null = null;

    if (upcomingVisits.length > 0 && upcomingVisits[0].providerId) {
      doctorId = upcomingVisits[0].providerId;
    } else if (recentVisits.length > 0 && recentVisits[0].providerId) {
      doctorId = recentVisits[0].providerId;
    }

    // Get doctor information with appointment types
    const doctor = await prisma.provider.findFirst({
      where: doctorId ? { id: doctorId } : undefined,
      include: {
        appointmentTypes: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    // Get open/pending tasks
    const openTasks = await prisma.task.findMany({
      where: {
        patientId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
      orderBy: { priority: 'desc' },
      take: 10,
    });

    // Build context string
    let context = `=== PATIENT INFORMATION ===\n`;
    context += `Name: ${patient.firstName} ${patient.lastName}\n`;
    context += `Preferred Language: ${patient.preferredLanguage}\n`;
    context += `Timezone: ${patient.timezone}\n\n`;

    // Clinical Profile
    if (patient.clinicalProfile) {
      context += `=== CLINICAL PROFILE ===\n`;
      if (patient.clinicalProfile.bloodType) {
        context += `Blood Type: ${patient.clinicalProfile.bloodType}\n`;
      }
      if (patient.clinicalProfile.allergies.length > 0) {
        context += `⚠️ ALLERGIES: ${patient.clinicalProfile.allergies.join(', ')}\n`;
      }
      if (patient.clinicalProfile.chronicConditions.length > 0) {
        context += `Chronic Conditions: ${patient.clinicalProfile.chronicConditions.join(', ')}\n`;
      }
      if (patient.clinicalProfile.currentMedications.length > 0) {
        context += `Current Medications: ${patient.clinicalProfile.currentMedications.join(', ')}\n`;
      }
      if (patient.clinicalProfile.activeProblems.length > 0) {
        context += `Active Problems: ${patient.clinicalProfile.activeProblems.join(', ')}\n`;
      }
      if (patient.clinicalProfile.smokingStatus) {
        context += `Smoking Status: ${patient.clinicalProfile.smokingStatus}\n`;
      }
      if (patient.clinicalProfile.occupation) {
        context += `Occupation: ${patient.clinicalProfile.occupation}\n`;
      }
      context += `\n`;
    }

    // Recent Visit History
    if (recentVisits.length > 0) {
      context += `=== RECENT VISIT HISTORY ===\n`;
      recentVisits.forEach((visit, idx) => {
        context += `${idx + 1}. ${visit.completedAt?.toLocaleDateString()} - ${visit.reasonForVisit}\n`;
        if (visit.patientSummary) {
          context += `   Summary: ${visit.patientSummary}\n`;
        }
        if (visit.patientInstructions) {
          context += `   Instructions Given: ${visit.patientInstructions}\n`;
        }
      });
      context += `\n`;
    } else {
      context += `=== VISIT HISTORY ===\nThis patient has no previous visits. This may be their first time at the clinic.\n\n`;
    }

    // Upcoming Appointments
    if (upcomingVisits.length > 0) {
      context += `=== UPCOMING APPOINTMENTS ===\n`;
      upcomingVisits.forEach((visit) => {
        context += `- ID: ${visit.id}\n`;
        context += `  Date: ${visit.scheduledAt.toLocaleString()}\n`;
        context += `  Reason: ${visit.reasonForVisit}\n`;
        context += `  Type: ${visit.visitType} (${visit.durationMinutes} minutes)\n`;
        context += `  Priority: ${visit.priorityScore}/10\n`;
      });
      context += `\n`;
    }

    // Open Tasks (IMPORTANT FOR FOLLOW-UP)
    if (openTasks.length > 0) {
      context += `=== OPEN TASKS (Ask about these!) ===\n`;
      openTasks.forEach((task) => {
        context += `- [${task.status}] ${task.title} (${task.taskType})\n`;
        if (task.description) {
          context += `  ${task.description}\n`;
        }
        if (task.dueDate) {
          context += `  Due: ${task.dueDate.toLocaleDateString()}\n`;
        }
      });
      context += `\n`;
    }

    // Get patient's uploaded files
    const patientFiles = await prisma.patientFile.findMany({
      where: {
        patientId,
        deletedAt: null,
      },
      select: {
        id: true,
        fileName: true,
        fileCategory: true,
        description: true,
        createdAt: true,
        reviewStatus: true,
        reviewedAt: true,
        aiSummary: true,
        _count: {
          select: { comments: true, annotations: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Uploaded Medical Files Section
    if (patientFiles.length > 0) {
      context += `=== UPLOADED MEDICAL FILES ===\n`;
      patientFiles.forEach((file, idx) => {
        context += `${idx + 1}. ${file.fileName} (${file.fileCategory})\n`;
        context += `   Uploaded: ${file.createdAt.toLocaleDateString()}\n`;
        context += `   Status: ${file.reviewStatus}${file.reviewedAt ? ` (reviewed ${file.reviewedAt.toLocaleDateString()})` : ''}\n`;
        if (file.description) {
          context += `   Description: ${file.description}\n`;
        }
        if (file.aiSummary) {
          context += `   AI Summary: ${file.aiSummary}\n`;
        }
        if (file._count.comments > 0 || file._count.annotations > 0) {
          context += `   Doctor's Feedback: ${file._count.comments} comment(s), ${file._count.annotations} annotation(s)\n`;
        }
      });
      context += `\n`;
    }

    // Doctor & Clinic Information
    // NOTE: Doctor specialty and profileDescription are now retrieved via get_doctor_profile tool
    if (doctor) {
      context += `=== DOCTOR & CLINIC INFORMATION ===\n`;
      context += `Doctor: Dr. ${doctor.firstName} ${doctor.lastName}\n`;
      context += `(Use get_doctor_profile tool if patient asks about doctor's specialty or background)\n`;
      if (doctor.clinicName) {
        context += `Clinic: ${doctor.clinicName}\n`;
      }
      if (doctor.clinicAddress) {
        context += `Address: ${doctor.clinicAddress}, ${doctor.clinicCity}, ${doctor.clinicCountry}\n`;
      }
      if (doctor.clinicPhone) {
        context += `Phone: ${doctor.clinicPhone}\n`;
      }

      // AI Instructions for this doctor
      if (doctor.aiInstructions) {
        context += `\n📋 SPECIAL INSTRUCTIONS FROM DOCTOR:\n${doctor.aiInstructions}\n`;
      }

      // General pre-visit notes
      if (doctor.preVisitNotes) {
        context += `\n📝 GENERAL PRE-VISIT INSTRUCTIONS:\n${doctor.preVisitNotes}\n`;
      }

      // Appointment Types
      if (doctor.appointmentTypes && doctor.appointmentTypes.length > 0) {
        context += `\n=== AVAILABLE APPOINTMENT TYPES ===\n`;
        doctor.appointmentTypes.forEach((apptType) => {
          context += `- ${apptType.name} (${apptType.code}): ${apptType.durationMinutes} minutes\n`;
          if (apptType.description) {
            context += `  ${apptType.description}\n`;
          }
          if (apptType.preVisitInstructions) {
            context += `  Pre-visit: ${apptType.preVisitInstructions}\n`;
          }
        });
      }

      context += `\n`;
    }

    return context;
  } catch (error) {
    console.error('Error getting patient context:', error);
    return 'Patient context unavailable.';
  }
}

export async function generateChatResponse(
  patientId: string,
  message: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<{ response: string; action?: any }> {
  const startTime = Date.now();

  try {
    // Security check: Validate user input for prompt injection attempts
    const securityCheck = checkPromptSecurity(message);
    if (!securityCheck.isSafe) {
      logSecurityEvent('prompt_injection_attempt', {
        patientId,
        threats: securityCheck.threats,
        riskScore: securityCheck.riskScore,
      }, 'warning');

      // Return a safe response without processing the malicious input
      return {
        response: "I'm sorry, but I can only help with medical scheduling and healthcare-related questions. How can I assist you with booking an appointment or answering questions about your healthcare needs?",
      };
    }

    // Sanitize the input
    const sanitizedMessage = sanitizeInput(message);

    // Get patient context
    const patientContext = await getPatientContext(patientId);

    // Redact PII from patient context before sending to AI
    const redactedContext = redactPatientContext(patientContext);

    // Define available functions
    const tools: OpenAI.Chat.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'check_availability',
          description: `Check if a SPECIFIC date and time is available for a NEW appointment booking.

Note: For RESCHEDULING, do NOT use this tool. Instead, use check_doctor_availability to fetch all available slots for the day and show them to the patient.

Use this when:
- Patient is BOOKING a new appointment (not rescheduling)
- You want to verify a specific time before booking
- Before confirming any new appointment time

The function checks:
- Database conflicts (other appointments)
- Google Calendar conflicts (doctor's personal schedule)
- Time is within business hours

Returns: { available: true/false, conflictReason?: string }`,
          parameters: {
            type: 'object',
            properties: {
              scheduledAt: {
                type: 'string',
                description: 'The date and time to check in ISO 8601 format (e.g., "2025-11-12T15:00:00Z")',
              },
              durationMinutes: {
                type: 'number',
                description: 'Duration of appointment in minutes (30 for routine, 40 for new patients, 20 for follow-ups)',
              },
            },
            required: ['scheduledAt', 'durationMinutes'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'book_appointment',
          description: `Book a NEW medical appointment ONLY after:
1. You checked availability using check_availability tool
2. You confirmed the time is available
3. You had a brief conversation gathering reason for visit
4. Patient confirmed they want to book at that time

Call this function when:
- You ALREADY checked availability and it's free
- You have asked about their reason/symptoms (at least 1-2 questions)
- You know when they want to come (specific date/time)
- Patient has confirmed they want to book at that time

Don't call immediately - have 2-3 message exchanges first to gather information!`,
          parameters: {
            type: 'object',
            properties: {
              scheduledAt: {
                type: 'string',
                description: 'The EXACT date and time agreed upon with the patient in ISO 8601 format (e.g., "2025-11-11T14:00:00Z")',
              },
              visitType: {
                type: 'string',
                description: 'Type of visit: use "new_patient" for first visits, "follow_up" for returning patients, or "urgent" for urgent cases',
              },
              reasonForVisit: {
                type: 'string',
                description: 'A clear summary of why the patient is coming in (based on your conversation)',
              },
              symptoms: {
                type: 'string',
                description: 'Detailed symptoms discussed during the conversation',
              },
              priorityScore: {
                type: 'number',
                description: 'Priority score 1-10 based on urgency, severity, and patient history (1=low, 5=moderate, 10=emergency)',
              },
              durationMinutes: {
                type: 'number',
                description: 'Duration in minutes: 30 for routine, 40 for new patients, 20 for follow-ups',
              },
            },
            required: ['scheduledAt', 'visitType', 'reasonForVisit', 'priorityScore', 'durationMinutes'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'check_doctor_availability',
          description: `Fetch ALL available time slots for a specific day from doctor's Google Calendar.

**PRIMARY USE: RESCHEDULING APPOINTMENTS**
When a patient wants to reschedule and provides a date/day:
1. Patient says: "I'd like Wednesday at 3 PM" or just "Wednesday"
2. YOU: Call check_doctor_availability for that entire day
3. YOU: Display all available slots to patient: "Here are available times on Wednesday: 10 AM, 11 AM, 12 PM, 2 PM, 3 PM, 4 PM"
4. Patient: Confirms or picks from the list
5. YOU: Reschedule with their confirmed time

**ALSO use when:**
- Patient asks "what times are available on [specific day]?"
- Patient needs to find flexible scheduling options for a day they prefer

This returns actual available time slots based on:
- Doctor's calendar (Google Calendar - real-time)
- Existing appointments in database
- Doctor's working hours and buffers`,
          parameters: {
            type: 'object',
            properties: {
              startDate: {
                type: 'string',
                description: 'Start date to check availability (ISO 8601 format, e.g., "2025-10-22")',
              },
              endDate: {
                type: 'string',
                description: 'End date to check availability (ISO 8601 format, e.g., "2025-10-29")',
              },
              durationMinutes: {
                type: 'number',
                description: 'Duration needed for the appointment in minutes (based on appointment type)',
              },
            },
            required: ['startDate', 'endDate', 'durationMinutes'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'reschedule_appointment',
          description: `Reschedule an EXISTING appointment to a new date/time.

**REQUIRED WORKFLOW:**
1. Ask patient: "What date and time would work better for you?"
2. Patient says a day/time (e.g., "Wednesday at 3 PM" or "Wednesday")
3. Call check_doctor_availability to fetch ALL slots for that day
4. Show patient the available times: "Here are available times on Wednesday: 10 AM, 11 AM, 12 PM, 2 PM, 3 PM, 4 PM"
5. Patient confirms their preferred time
6. Use THIS tool to reschedule with the confirmed time

Use this when:
- Patient has confirmed a specific date and time from the available slots
- You've used check_doctor_availability to fetch and show available times for that day
- You have the appointment ID from patient context (in upcoming appointments)
- You have the exact ISO 8601 datetime they confirmed

Example flow:
- Patient: "Wednesday at 3 PM"
- You: [check_doctor_availability for Wednesday]
- You: "Here are available times: 10 AM, 11 AM, 12 PM, 2 PM, 3 PM, 4 PM"
- Patient: "3 PM works"
- You: [reschedule_appointment with Wed 3 PM time]
- Confirm: "Perfect! I've rescheduled your appointment to Wednesday at 3 PM"`,
          parameters: {
            type: 'object',
            properties: {
              appointmentId: {
                type: 'string',
                description: 'The ID of the existing appointment to reschedule. Look in the patient context for upcoming appointments.',
              },
              newScheduledAt: {
                type: 'string',
                description: 'The new date and time for the appointment in ISO 8601 format (e.g., "2025-10-25T14:00:00Z"). Use a slot from check_doctor_availability results!',
              },
            },
            required: ['appointmentId', 'newScheduledAt'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'cancel_appointment',
          description: 'Cancel an EXISTING appointment. Use this when the patient wants to cancel their appointment.',
          parameters: {
            type: 'object',
            properties: {
              appointmentId: {
                type: 'string',
                description: 'The ID of the appointment to cancel. Look in the patient context for upcoming appointments.',
              },
            },
            required: ['appointmentId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'mark_task_completed',
          description: `Mark a task as COMPLETED when the patient confirms they have done it (blood test, MRI, prescription pickup, etc.).
Use this when:
- Patient says they completed a task
- Patient mentions they did the lab work, imaging, or other doctor's orders
- Patient uploads results for a pending task

IMPORTANT: After marking complete, encourage them to upload the results if they haven't already!`,
          parameters: {
            type: 'object',
            properties: {
              taskId: {
                type: 'string',
                description: 'The ID of the task to mark as completed. Look in the OPEN TASKS section of patient context.',
              },
              notes: {
                type: 'string',
                description: 'Optional notes about the task completion (e.g., "Patient uploaded lab results")',
              },
            },
            required: ['taskId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_doctor_profile',
          description: `Retrieve information about the patient's doctor including their specialty and professional background. Use this when:
- Patient asks "Tell me about the doctor" or "Who is the doctor?"
- Patient asks "What is the doctor's specialty?"
- Patient asks "What's the doctor's experience?" or "Tell me about Dr. [Name]'s background"
- Patient wants to know more about their healthcare provider

This tool returns the doctor's name, specialty, and professional background information.`,
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_doctor_instructions',
          description: `Retrieve the doctor's instructions and pre-visit notes to share with the patient. Use this when:
- Patient asks "What should I do before my appointment?"
- Patient asks "What instructions do I need to follow?"
- Patient asks "What should I prepare for the visit?"
- At the beginning of a conversation to proactively share doctor's AI instructions and pre-visit guidance
- Patient asks "What does the doctor want me to know?"
- Before appointment details, offer relevant instructions

This tool returns:
- AI Instructions: Custom instructions from the doctor for the AI assistant to share with patients
- Pre-Visit Notes: General instructions patients should follow before appointments
- Appointment-Type-Specific Instructions: Special instructions based on the type of appointment`,
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_doctor_settings',
          description: `Retrieve COMPLETE doctor settings and information including all configuration details. Use this when:
- Patient asks "What are the doctor's office hours?"
- Patient asks "Where is the clinic located?" or "How do I get to the office?"
- Patient asks "Is the doctor's calendar connected?" or "What appointment times are available?"
- Patient asks "What are the clinic details?" or "Tell me about the clinic"
- Patient asks "What is the doctor's timezone or location?"
- Patient asks for complete doctor/clinic information
- Patient needs full details about the doctor's practice

This tool returns ALL doctor settings:
✅ Profile: Name, specialty, license number, professional background
✅ Clinic: Clinic name, address, city, country, phone
✅ Location: Office location details, parking instructions, building info
✅ Calendar: Calendar provider, connection status, email, timezone
✅ Schedule: Working hours (by day), buffer times before/after appointments
✅ AI Configuration: AI instructions for sharing with patients, pre-visit notes
✅ Appointment: Available appointment types and their configurations`,
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_my_files',
          description: `Show all files the patient has uploaded to their medical chart. Returns a list of uploaded files with dates, categories, and doctor review status. Use this when:
- Patient asks "What files have I uploaded?"
- Patient asks "Show me my documents"
- Patient wants to see their uploaded medical records
- Patient asks "What files did I send to the doctor?"`,
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_file_details',
          description: `Get detailed information about a specific uploaded file including doctor's annotations, comments, and review status. Use this when:
- Patient asks about a specific file they uploaded
- Patient wants to see doctor's comments on a file
- Patient asks "What did the doctor say about my lab results?"
- Patient wants detailed information about a file`,
          parameters: {
            type: 'object',
            properties: {
              fileId: {
                type: 'string',
                description: 'The ID of the file to get details about',
              },
            },
            required: ['fileId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'delete_patient_file',
          description: `Archive/remove a file from the patient's active files. The file is soft-deleted (can be recovered within 90 days). Use this when:
- Patient asks to delete or remove a file
- Patient wants to hide a document from their chart
- Patient asks "Can I remove this file?"`,
          parameters: {
            type: 'object',
            properties: {
              fileId: {
                type: 'string',
                description: 'The ID of the file to delete/archive',
              },
            },
            required: ['fileId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_patient_uploaded_files',
          description: `Retrieve list of files uploaded by the patient for review and annotation. This tool is for doctors to see all patient's uploaded medical documents. Use this when:
- Doctor/AI needs to review patient's uploaded files
- Doctor wants to view documents for a patient's case
- Starting file review or annotation workflow
- Patient mentions they uploaded something and you need to reference it

Returns: List of all non-deleted files with metadata including filename, category, description, upload date, current review status, and any AI-generated summaries.`,
          parameters: {
            type: 'object',
            properties: {
              patientId: {
                type: 'string',
                description: 'The ID of the patient whose files to retrieve. Use the current patient ID from context.',
              },
            },
            required: ['patientId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'annotate_patient_file',
          description: `Add annotations to a patient's uploaded file. Annotations include highlights, notes, flags, or corrections that the doctor wants to mark on the document for reference. Use this when:
- Doctor wants to highlight important findings in a lab result
- Doctor wants to flag abnormal results in imaging
- Doctor wants to note corrections or clarifications on a document
- Doctor needs to mark up a file with specific observations

Annotation types: 'highlight' (mark important info), 'note' (add observation), 'flag' (mark as important), 'correction' (note an error/correction).`,
          parameters: {
            type: 'object',
            properties: {
              fileId: {
                type: 'string',
                description: 'The ID of the file to annotate',
              },
              annotationType: {
                type: 'string',
                description: 'Type of annotation: highlight, note, flag, or correction',
                enum: ['highlight', 'note', 'flag', 'correction'],
              },
              content: {
                type: 'string',
                description: 'The text content of the annotation (observation, note, or flag message)',
              },
            },
            required: ['fileId', 'annotationType', 'content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'comment_on_patient_file',
          description: `Add a comment on a patient's file that is visible to the patient. Comments are for communicating with patients about their documents - explaining findings, asking for clarification, providing medical guidance, or acknowledging receipt. Use this when:
- Doctor wants to explain lab result findings to patient
- Doctor wants to provide feedback on imaging
- Doctor wants to ask patient for clarification on a document
- Doctor wants to acknowledge receipt of a file and provide initial assessment

Comments are visible to the patient and create a communication record about that specific file.`,
          parameters: {
            type: 'object',
            properties: {
              fileId: {
                type: 'string',
                description: 'The ID of the file to comment on',
              },
              comment: {
                type: 'string',
                description: 'The comment text to add (visible to patient). Be professional and medical in tone.',
              },
            },
            required: ['fileId', 'comment'],
          },
        },
      },
    ];

    // Prepare messages for OpenAI
    const now = new Date();
    const currentDateTime = now.toLocaleString('en-US', {
      timeZone: 'Asia/Beirut',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `Patient Context:\n${redactedContext}\n\nIMPORTANT: Current date and time is ${currentDateTime} (Beirut/Lebanon timezone, UTC+2). When booking appointments:
- Use dates/times AFTER the current time
- CRITICAL: When user says "4 PM" or any time, you MUST add 2 hours to convert to UTC. For example: 4 PM Beirut = 14:00 UTC = "2025-11-11T14:00:00.000Z"
- Format dates in ISO 8601 UTC format (e.g., "2025-10-22T12:00:00.000Z" for 2 PM Beirut time)
- Business hours are 9 AM - 5 PM Beirut time, Monday-Friday
- Our doctor is Dr. John Smith
- When user says "today" or "tomorrow", calculate based on current date/time above

CRITICAL WORKFLOW FOR SUGGESTING TIMES:
1. When patient asks about availability on a specific day, you MUST check EACH time slot individually using check_availability
2. Check multiple times: 9 AM, 10 AM, 11 AM, 1 PM, 2 PM, 3 PM, 4 PM
3. ONLY suggest times that returned { available: true }
4. DO NOT list times without checking them first - this creates false promises to patients!` },
      ...conversationHistory.slice(-20).map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: redactPII(msg.content).redactedText,
      })),
      { role: 'user', content: sanitizedMessage },
    ];

    // Call OpenAI API with function calling
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 500,
    });

    // Track API usage and cost
    if (completion.usage) {
      trackUsage(
        process.env.OPENAI_MODEL || 'gpt-4o',
        'chat_response',
        completion.usage.prompt_tokens,
        completion.usage.completion_tokens,
        Date.now() - startTime,
        { userId: patientId }
      );
    }

    const responseMessage = completion.choices[0]?.message;
    let finalResponse = responseMessage?.content || 'I apologize, but I was unable to generate a response. Please try again.';
    let actionResult = null;

    // Check if the AI wants to call functions
    if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
      // Handle ALL tool calls (can be multiple in parallel)
      const toolCalls = responseMessage.tool_calls;

      // Check if all tool calls are check_availability
      const allCheckAvailability = toolCalls.every((tc: any) => tc.function?.name === 'check_availability');

      if (allCheckAvailability && toolCalls.length > 1) {
        // Handle multiple parallel check_availability calls
        console.log(`🔍 Checking ${toolCalls.length} time slots in parallel...`);

        const toolResponses: OpenAI.Chat.ChatCompletionMessageParam[] = [];

        for (const toolCall of toolCalls) {
          const functionCall = (toolCall as any).function;
          const args = JSON.parse(functionCall.arguments);

          const availabilityResult = await checkAvailability(args.scheduledAt, args.durationMinutes);
          console.log(`   ${args.scheduledAt}: ${availabilityResult.available ? '✅ Available' : '❌ Not available' + (availabilityResult.conflictReason ? ' - ' + availabilityResult.conflictReason : '')}`);

          toolResponses.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(availabilityResult),
          });
        }

        // Generate final response with all availability results
        const followUpMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          ...messages,
          responseMessage,
          ...toolResponses,
        ];

        const followUpCompletion = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          messages: followUpMessages,
          temperature: 0.7,
          max_tokens: 500,
        });

        finalResponse = followUpCompletion.choices[0]?.message?.content || finalResponse;
      } else {
        // Handle single tool call or first tool call
        const toolCall = toolCalls[0];
        const functionCall = (toolCall as any).function;

        if (functionCall?.name === 'check_availability') {
          const args = JSON.parse(functionCall.arguments);

          // Check availability
          const availabilityResult = await checkAvailability(args.scheduledAt, args.durationMinutes);

          console.log(`🔍 Checking availability for ${args.scheduledAt}: ${availabilityResult.available ? '✅ Available' : '❌ Not available' + (availabilityResult.conflictReason ? ' - ' + availabilityResult.conflictReason : '')}`);

          // Generate a follow-up response with availability information
          const followUpMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            ...messages,
            responseMessage,
            {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(availabilityResult),
            },
          ];

          const followUpCompletion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            messages: followUpMessages,
            tools,
            tool_choice: 'auto',
            temperature: 0.7,
            max_tokens: 500,
          });

          finalResponse = followUpCompletion.choices[0]?.message?.content || finalResponse;
        } else if (functionCall?.name === 'book_appointment') {
          const args = JSON.parse(functionCall.arguments);

          console.log('📅 BOOKING APPOINTMENT:', {
            scheduledAt: args.scheduledAt,
            visitType: args.visitType,
            reasonForVisit: args.reasonForVisit,
            priorityScore: args.priorityScore,
            durationMinutes: args.durationMinutes,
          });

          try {
            // Book the appointment
            const appointmentResult = await bookAppointmentForPatient(patientId, args);
            actionResult = appointmentResult;

            console.log('✅ APPOINTMENT BOOKED SUCCESSFULLY:', appointmentResult.id);

            // Send success result back to AI  for confirmation message
            const followUpMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
              ...messages,
              responseMessage,
              {
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  success: true,
                  appointmentId: appointmentResult.id,
                  scheduledAt: appointmentResult.scheduledAt,
                  visitType: appointmentResult.visitType,
                  reasonForVisit: appointmentResult.reasonForVisit,
                }),
              },
            ];

            const followUpCompletion = await openai.chat.completions.create({
              model: process.env.OPENAI_MODEL || 'gpt-4o',
              messages: followUpMessages,
              temperature: 0.7,
              max_tokens: 500,
            });

            finalResponse = followUpCompletion.choices[0]?.message?.content ||
              'Perfect! Your appointment has been successfully booked!';
            console.log('✅ CONFIRMATION MESSAGE SENT TO PATIENT');
          } catch (bookingError: any) {
            // Handle booking errors gracefully
            console.error('❌ BOOKING FAILED:', bookingError.message || bookingError);
            console.error('   Error details:', bookingError);

            // Send error back to AI so it can explain to patient
            const errorMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
              ...messages,
              responseMessage,
              {
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  success: false,
                  error: bookingError.message || 'Appointment booking failed'
                }),
              },
            ];

            try {
              const errorCompletion = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o',
                messages: errorMessages,
                temperature: 0.7,
                max_tokens: 300,
              });

              finalResponse = errorCompletion.choices[0]?.message?.content ||
                `I'm sorry, but I wasn't able to complete the booking: ${bookingError.message}. Please try again with a different time.`;
            } catch (aiErrorHandlingError: any) {
              // If AI call fails, use fallback
              console.error('❌ Error generating error message:', aiErrorHandlingError.message);
              finalResponse = `I'm sorry, but I wasn't able to complete the booking. Error: ${bookingError.message}. Please try again.`;
            }
          }
        } else if (functionCall?.name === 'check_doctor_availability') {
          const args = JSON.parse(functionCall.arguments);

          // Check availability for the patient's doctor
          const availabilityResult = await getDoctorAvailableSlots(
            { startDate: args.startDate, endDate: args.endDate },
            args.durationMinutes,
            patientId  // Pass patient ID to get their specific doctor
          );

          // Generate a follow-up response with available slots
          const followUpMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            ...messages,
            responseMessage,
            {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ success: true, availability: availabilityResult }),
            },
          ];

          const followUpCompletion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            messages: followUpMessages,
            temperature: 0.7,
            max_tokens: 500,
          });

          finalResponse = followUpCompletion.choices[0]?.message?.content || finalResponse;
        } else if (functionCall?.name === 'reschedule_appointment') {
          const args = JSON.parse(functionCall.arguments);

          try {
            // Reschedule the appointment
            const appointmentResult = await rescheduleAppointmentForPatient(args.appointmentId, args.newScheduledAt);
            actionResult = appointmentResult;

            // Get doctor instructions to share after rescheduling
            const instructionsResult = await getDoctorInstructions(patientId);

            // Generate a follow-up response confirming the rescheduling
            const followUpMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
              ...messages,
              responseMessage,
              {
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  success: true,
                  appointment: appointmentResult,
                  doctorInstructions: instructionsResult
                }),
              },
            ];

            const followUpCompletion = await openai.chat.completions.create({
              model: process.env.OPENAI_MODEL || 'gpt-4o',
              messages: followUpMessages,
              temperature: 0.7,
              max_tokens: 500,
            });

            finalResponse = followUpCompletion.choices[0]?.message?.content || finalResponse;
          } catch (rescheduleError: any) {
            // Handle rescheduling errors gracefully
            console.error('❌ Rescheduling error:', rescheduleError.message);

            try {
              // Send error message to AI for it to handle naturally
              const errorMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
                ...messages,
                responseMessage,
                {
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({
                    success: false,
                    error: rescheduleError.message
                  }),
                },
              ];

              const errorCompletion = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o',
                messages: errorMessages,
                temperature: 0.7,
                max_tokens: 300,
              });

              finalResponse = errorCompletion.choices[0]?.message?.content ||
                `I'm sorry, but I wasn't able to reschedule the appointment: ${rescheduleError.message}. Please try again with a different time.`;
            } catch (aiErrorHandlingError: any) {
              // If even the error handling fails, provide a simple fallback message
              console.error('❌ Error while handling reschedule error:', aiErrorHandlingError.message);
              finalResponse = `I'm sorry, but I wasn't able to reschedule the appointment: ${rescheduleError.message}. Please try again with a different time.`;
            }
          }
        } else if (functionCall?.name === 'cancel_appointment') {
          const args = JSON.parse(functionCall.arguments);

          try {
            // Cancel the appointment
            const appointmentResult = await cancelAppointmentForPatient(args.appointmentId);
            actionResult = appointmentResult;

            // Generate a follow-up response confirming the cancellation
            const followUpMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
              ...messages,
              responseMessage,
              {
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({ success: true, message: 'Appointment cancelled successfully' }),
              },
            ];

            const followUpCompletion = await openai.chat.completions.create({
              model: process.env.OPENAI_MODEL || 'gpt-4o',
              messages: followUpMessages,
              temperature: 0.7,
              max_tokens: 300,
            });

          finalResponse = followUpCompletion.choices[0]?.message?.content || finalResponse;
        } catch (error: any) {
          // Handle cancellation error (e.g., appointment not found or already cancelled)
          const errorMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            ...messages,
            responseMessage,
            {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                success: false,
                error: error.message || 'Unable to cancel appointment',
                message: 'The appointment could not be cancelled. It may have already been cancelled or no longer exists.'
              }),
            },
          ];

          const errorCompletion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            messages: errorMessages,
            temperature: 0.7,
            max_tokens: 300,
          });

            finalResponse = errorCompletion.choices[0]?.message?.content || 'I apologize, but I was unable to cancel that appointment. It may have already been cancelled or removed from the system.';
          }
        } else if (functionCall?.name === 'mark_task_completed') {
          const args = JSON.parse(functionCall.arguments);

          try {
            // Mark the task as completed
            const taskResult = await markTaskAsCompleted(args.taskId, args.notes);
            actionResult = taskResult;

            // Generate a follow-up response confirming the task completion
            const followUpMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
              ...messages,
              responseMessage,
              {
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  success: true,
                  task: taskResult,
                  message: 'Task marked as completed successfully'
                }),
              },
            ];

            const followUpCompletion = await openai.chat.completions.create({
              model: process.env.OPENAI_MODEL || 'gpt-4o',
              messages: followUpMessages,
              temperature: 0.7,
              max_tokens: 300,
            });

            finalResponse = followUpCompletion.choices[0]?.message?.content || finalResponse;
          } catch (error: any) {
            // Handle task completion error
            const errorMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
              ...messages,
              responseMessage,
              {
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  success: false,
                  error: error.message || 'Unable to mark task as completed',
                  message: 'The task could not be marked as completed. It may not exist or already be completed.'
                }),
              },
            ];

            const errorCompletion = await openai.chat.completions.create({
              model: process.env.OPENAI_MODEL || 'gpt-4o',
              messages: errorMessages,
              temperature: 0.7,
              max_tokens: 300,
            });

            finalResponse = errorCompletion.choices[0]?.message?.content || 'I apologize, but I was unable to mark that task as completed.';
          }
        } else if (functionCall?.name === 'get_doctor_profile') {
          // Get doctor profile information
          const doctorProfileResult = await getDoctorProfileInfo(patientId);

          console.log(`🎯 Doctor profile tool called for patient ${patientId}`);

          // Generate a follow-up response with doctor information
          const followUpMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            ...messages,
            responseMessage,
            {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(doctorProfileResult),
            },
          ];

          const followUpCompletion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            messages: followUpMessages,
            temperature: 0.7,
            max_tokens: 500,
          });

          finalResponse = followUpCompletion.choices[0]?.message?.content || finalResponse;
        } else if (functionCall?.name === 'get_doctor_instructions') {
          // Get doctor instructions
          const instructionsResult = await getDoctorInstructions(patientId);

          console.log(`🎯 Doctor instructions tool called for patient ${patientId}`);

          // Generate a follow-up response with doctor instructions
          const followUpMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            ...messages,
            responseMessage,
            {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(instructionsResult),
            },
          ];

          const followUpCompletion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            messages: followUpMessages,
            temperature: 0.7,
            max_tokens: 500,
          });

          finalResponse = followUpCompletion.choices[0]?.message?.content || finalResponse;
        } else if (functionCall?.name === 'get_doctor_settings') {
          // Get all doctor settings
          const settingsResult = await getDoctorSettings(patientId);

          console.log(`📋 Doctor settings tool called for patient ${patientId}`);

          // Generate a follow-up response with doctor settings
          const followUpMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            ...messages,
            responseMessage,
            {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(settingsResult),
            },
          ];

          const followUpCompletion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            messages: followUpMessages,
            temperature: 0.7,
            max_tokens: 1000,
          });

          finalResponse = followUpCompletion.choices[0]?.message?.content || finalResponse;
        } else if (functionCall?.name === 'list_my_files') {
          // List all patient's uploaded files
          console.log(`📂 Listing files for patient ${patientId}`);

          const files = await prisma.patientFile.findMany({
            where: {
              patientId,
              deletedAt: null,
            },
            select: {
              id: true,
              fileName: true,
              fileCategory: true,
              description: true,
              createdAt: true,
              reviewStatus: true,
              reviewedAt: true,
              _count: {
                select: { comments: true, annotations: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          });

          const filesSummary = files.map(f => ({
            id: f.id,
            name: f.fileName,
            category: f.fileCategory,
            description: f.description,
            uploadedAt: f.createdAt.toISOString(),
            reviewed: f.reviewStatus !== 'PENDING',
            reviewStatus: f.reviewStatus,
            doctorComments: f._count.comments,
            doctorAnnotations: f._count.annotations,
          }));

          const followUpMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            ...messages,
            responseMessage,
            {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                totalFiles: filesSummary.length,
                files: filesSummary,
                message: filesSummary.length > 0
                  ? `You have uploaded ${filesSummary.length} file(s)`
                  : 'You haven\'t uploaded any files yet',
              }),
            },
          ];

          const followUpCompletion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            messages: followUpMessages,
            temperature: 0.7,
            max_tokens: 800,
          });

          finalResponse = followUpCompletion.choices[0]?.message?.content || finalResponse;
        } else if (functionCall?.name === 'get_file_details') {
          // Get details about a specific file
          const fileId = (functionCall as any)?.arguments ? JSON.parse((functionCall as any).arguments).fileId : null;

          if (!fileId) {
            finalResponse = 'Please specify which file you want to view details about.';
          } else {
            console.log(`📄 Getting file details for ${fileId}`);

            const file = await prisma.patientFile.findFirst({
              where: {
                id: fileId,
                patientId,
                deletedAt: null,
              },
              include: {
                comments: {
                  select: {
                    id: true,
                    content: true,
                    doctor: { select: { firstName: true, lastName: true } },
                    createdAt: true,
                  },
                },
                annotations: {
                  select: {
                    id: true,
                    content: true,
                    annotationType: true,
                    doctor: { select: { firstName: true, lastName: true } },
                    createdAt: true,
                  },
                },
              },
            });

            if (!file) {
              finalResponse = 'File not found or has been deleted.';
            } else {
              const fileDetails = {
                fileName: file.fileName,
                category: file.fileCategory,
                description: file.description,
                uploadedAt: file.createdAt.toISOString(),
                reviewStatus: file.reviewStatus,
                reviewedAt: file.reviewedAt?.toISOString(),
                aiSummary: file.aiSummary,
                comments: file.comments.map(c => ({
                  from: `Dr. ${c.doctor?.firstName} ${c.doctor?.lastName}`,
                  comment: c.content,
                  date: c.createdAt.toISOString(),
                })),
                annotations: file.annotations.map(a => ({
                  type: a.annotationType,
                  note: a.content,
                  by: `Dr. ${a.doctor?.firstName} ${a.doctor?.lastName}`,
                  date: a.createdAt.toISOString(),
                })),
              };

              const followUpMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
                ...messages,
                responseMessage,
                {
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: JSON.stringify(fileDetails),
                },
              ];

              const followUpCompletion = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o',
                messages: followUpMessages,
                temperature: 0.7,
                max_tokens: 1000,
              });

              finalResponse = followUpCompletion.choices[0]?.message?.content || finalResponse;
            }
          }
        } else if (functionCall?.name === 'delete_patient_file') {
          // Soft delete a patient file
          const fileId = (functionCall as any)?.arguments ? JSON.parse((functionCall as any).arguments).fileId : null;

          if (!fileId) {
            finalResponse = 'Please specify which file you want to delete.';
          } else {
            console.log(`🗑️  Deleting file ${fileId} for patient ${patientId}`);

            const file = await prisma.patientFile.findFirst({
              where: {
                id: fileId,
                patientId,
              },
            });

            if (!file) {
              finalResponse = 'File not found.';
            } else if (file.deletedAt) {
              finalResponse = 'This file has already been deleted.';
            } else {
              await prisma.patientFile.update({
                where: { id: fileId },
                data: { deletedAt: new Date() },
              });

              // Create audit log
              await prisma.auditLog.create({
                data: {
                  actorType: 'patient',
                  actorId: patientId,
                  action: 'delete',
                  resourceType: 'patient_file',
                  resourceId: fileId,
                  rationale: 'Patient deleted their uploaded file',
                },
              });

              const followUpMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
                ...messages,
                responseMessage,
                {
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({
                    success: true,
                    fileName: file.fileName,
                    message: `File "${file.fileName}" has been deleted. You can restore it within 90 days if needed.`,
                  }),
                },
              ];

              const followUpCompletion = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o',
                messages: followUpMessages,
                temperature: 0.7,
                max_tokens: 500,
              });

              finalResponse = followUpCompletion.choices[0]?.message?.content || finalResponse;
            }
          }
        } else if (functionCall?.name === 'get_patient_uploaded_files') {
          // Get list of patient's uploaded files for doctor review
          const args = JSON.parse((functionCall as any).arguments);
          const patientIdForDoctorTools = args.patientId;

          console.log(`👨‍⚕️  Doctor retrieving uploaded files for patient ${patientIdForDoctorTools}`);

          const patientFiles = await prisma.patientFile.findMany({
            where: {
              patientId: patientIdForDoctorTools,
              deletedAt: null,
            },
            select: {
              id: true,
              fileName: true,
              fileCategory: true,
              description: true,
              createdAt: true,
              reviewStatus: true,
              reviewedAt: true,
              aiSummary: true,
              _count: {
                select: { comments: true, annotations: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          });

          const filesSummary = patientFiles.map(f => ({
            id: f.id,
            fileName: f.fileName,
            category: f.fileCategory,
            description: f.description,
            uploadedAt: f.createdAt.toISOString(),
            reviewStatus: f.reviewStatus,
            reviewedAt: f.reviewedAt?.toISOString(),
            aiSummary: f.aiSummary,
            hasComments: f._count.comments > 0,
            hasAnnotations: f._count.annotations > 0,
            commentCount: f._count.comments,
            annotationCount: f._count.annotations,
          }));

          const followUpMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            ...messages,
            responseMessage,
            {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                totalFiles: filesSummary.length,
                files: filesSummary,
                message: filesSummary.length > 0
                  ? `Patient has ${filesSummary.length} uploaded file(s) for review`
                  : 'Patient has not uploaded any files yet',
              }),
            },
          ];

          const followUpCompletion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            messages: followUpMessages,
            temperature: 0.7,
            max_tokens: 800,
          });

          finalResponse = followUpCompletion.choices[0]?.message?.content || finalResponse;
        } else if (functionCall?.name === 'annotate_patient_file') {
          // Add annotation to patient file
          const args = JSON.parse((functionCall as any).arguments);
          const { fileId, annotationType, content } = args;

          console.log(`📝 Adding ${annotationType} annotation to file ${fileId}`);

          try {
            // Verify file exists and get patient ID from it
            const file = await prisma.patientFile.findUnique({
              where: { id: fileId },
            });

            if (!file) {
              finalResponse = 'File not found.';
            } else {
              // Create annotation
              const annotation = await prisma.fileAnnotation.create({
                data: {
                  fileId,
                  doctorId: patientId, // In real scenario, this should be the actual doctor ID from auth
                  annotationType,
                  content,
                },
                include: {
                  doctor: { select: { firstName: true, lastName: true } },
                },
              });

              // Update file review status if not already reviewed
              if (file.reviewStatus === 'PENDING') {
                await prisma.patientFile.update({
                  where: { id: fileId },
                  data: { reviewStatus: 'REVIEWED', reviewedAt: new Date() },
                });
              }

              // Create audit log
              await prisma.auditLog.create({
                data: {
                  actorType: 'doctor',
                  actorId: patientId, // In real scenario, this should be the actual doctor ID
                  action: 'annotate',
                  resourceType: 'patient_file',
                  resourceId: fileId,
                  rationale: `Added ${annotationType} annotation to file`,
                },
              });

              const followUpMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
                ...messages,
                responseMessage,
                {
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({
                    success: true,
                    annotationId: annotation.id,
                    annotationType,
                    fileName: file.fileName,
                    message: `Annotation added successfully to "${file.fileName}"`,
                  }),
                },
              ];

              const followUpCompletion = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o',
                messages: followUpMessages,
                temperature: 0.7,
                max_tokens: 500,
              });

              finalResponse = followUpCompletion.choices[0]?.message?.content || finalResponse;
            }
          } catch (error: any) {
            console.error('Error adding annotation:', error.message);
            finalResponse = `Failed to add annotation: ${error.message}`;
          }
        } else if (functionCall?.name === 'comment_on_patient_file') {
          // Add comment to patient file (visible to patient)
          const args = JSON.parse((functionCall as any).arguments);
          const { fileId, comment } = args;

          console.log(`💬 Adding comment to file ${fileId}`);

          try {
            // Verify file exists
            const file = await prisma.patientFile.findUnique({
              where: { id: fileId },
            });

            if (!file) {
              finalResponse = 'File not found.';
            } else {
              // Create comment
              const commentRecord = await prisma.fileComment.create({
                data: {
                  fileId,
                  doctorId: patientId, // In real scenario, this should be the actual doctor ID from auth
                  content: comment,
                },
                include: {
                  doctor: { select: { firstName: true, lastName: true } },
                },
              });

              // Update file review status if not already reviewed
              if (file.reviewStatus === 'PENDING') {
                await prisma.patientFile.update({
                  where: { id: fileId },
                  data: { reviewStatus: 'REVIEWED', reviewedAt: new Date() },
                });
              }

              // Create audit log
              await prisma.auditLog.create({
                data: {
                  actorType: 'doctor',
                  actorId: patientId, // In real scenario, this should be the actual doctor ID
                  action: 'comment',
                  resourceType: 'patient_file',
                  resourceId: fileId,
                  rationale: 'Doctor added comment on patient file',
                },
              });

              const followUpMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
                ...messages,
                responseMessage,
                {
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({
                    success: true,
                    commentId: commentRecord.id,
                    fileName: file.fileName,
                    message: `Comment added successfully to "${file.fileName}" and is now visible to the patient`,
                  }),
                },
              ];

              const followUpCompletion = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o',
                messages: followUpMessages,
                temperature: 0.7,
                max_tokens: 500,
              });

              finalResponse = followUpCompletion.choices[0]?.message?.content || finalResponse;
            }
          } catch (error: any) {
            console.error('Error adding comment:', error.message);
            finalResponse = `Failed to add comment: ${error.message}`;
          }
        }
      }
    }

    // Create audit log for AI interaction
    await prisma.auditLog.create({
      data: {
        actorType: 'ai',
        action: actionResult ? 'create' : 'read',
        resourceType: actionResult ? 'visit' : 'message',
        resourceId: actionResult?.id || patientId,
        metadata: {
          userMessage: message,
          aiResponse: finalResponse,
          model: process.env.OPENAI_MODEL,
          actionTaken: actionResult ? 'appointment_booked' : 'none',
        },
        rationale: 'Patient chat interaction',
      },
    });

    return {
      response: finalResponse,
      action: actionResult,
    };
  } catch (error: any) {
    console.error('❌ OpenAI API error:', error?.message || error);
    console.error('   Full error:', error);
    throw new Error(`Failed to generate AI response: ${error?.message || 'Unknown error'}`);
  }
}

export async function generateDetailedPatientNarrative(
  formattedTranscript: string,
  patientContext: any,
  existingNarrative?: string
): Promise<string> {
  try {
    const systemPrompt = `You are an expert medical documentarian. Your task is to create or update a VERY DETAILED, COMPREHENSIVE patient narrative file based on doctor-patient conversations.

## CRITICAL REQUIREMENTS:

### 1. LENGTH & DETAIL:
- The narrative should be LONG and EXTREMELY DETAILED
- DO NOT summarize - capture the full story and nuances
- Include specific details, timelines, and contextual information
- Write in complete sentences and paragraphs, NOT bullet points
- Aim for a rich, thorough medical narrative

### 2. WHAT TO INCLUDE:
Extract and document EVERYTHING discussed:

**Background & History:**
- Patient's demographic information and context
- Family medical history with specific details
- Social history (occupation, lifestyle, habits, environment)
- Complete medical history chronologically
- All past diagnoses, treatments, and outcomes
- Surgical history with dates and details
- Medication history (current and past)
- Allergy information with reactions

**Current Medical Status:**
- Presenting symptoms with detailed descriptions
- Timeline of symptom development
- Impact on daily life and functioning
- Patient's concerns and questions
- Doctor's observations and assessment
- Physical examination findings
- Diagnostic impressions

**Clinical Course:**
- Detailed discussion of symptoms and their progression
- Doctor's clinical reasoning and thought process
- Treatment discussions and options considered
- Patient's response to previous treatments (if any)
- Any concerns or complications mentioned

**Plan & Follow-up:**
- Treatment plan with detailed rationale
- Medications prescribed with purposes
- Tests ordered and reasons
- Follow-up instructions
- Patient education provided
- Next steps and timeline

### 3. NARRATIVE STYLE:
- Write in third person, professional medical narrative style
- Use complete, well-formed sentences and paragraphs
- Connect ideas and create a flowing narrative
- Maintain chronological flow when possible
- Example: "The patient, a 45-year-old male with a history of hypertension, presented to the clinic reporting a three-week history of persistent headaches. He described the pain as throbbing, primarily located in the temporal region, with episodes lasting 2-4 hours. The headaches have been interfering with his work as an accountant, particularly during tax season when stress levels are elevated..."

### 4. UPDATING EXISTING NARRATIVE:
If an existing narrative is provided:
- READ the existing narrative thoroughly
- INTEGRATE new information seamlessly
- UPDATE any changed information
- ADD new details while preserving important historical context
- MAINTAIN chronological organization
- DO NOT simply append - weave new information into the appropriate sections
- If information conflicts, note the date of the new visit and the updated information

### 5. OUTPUT FORMAT:
Return a comprehensive medical narrative as continuous prose, organized into clear sections:

=== PATIENT BACKGROUND ===
[Detailed demographic and historical information]

=== MEDICAL HISTORY ===
[Comprehensive past medical history]

=== CURRENT PRESENTATION - [Date] ===
[Detailed current visit information]

=== CLINICAL ASSESSMENT ===
[Doctor's assessment and reasoning]

=== TREATMENT PLAN ===
[Detailed plan with rationale]

=== FOLLOW-UP & MONITORING ===
[Instructions and next steps]

Remember: This is a detailed medical record, not a summary. Be thorough, specific, and comprehensive.`;

    const userPrompt = existingNarrative
      ? `EXISTING PATIENT NARRATIVE:\n${existingNarrative}\n\n---\n\nPATIENT CONTEXT:\n${JSON.stringify(patientContext, null, 2)}\n\n---\n\nNEW VISIT TRANSCRIPT:\n${formattedTranscript}\n\n---\n\nINSTRUCTIONS: Update the existing narrative by integrating information from this new visit. Maintain the comprehensive, detailed style. Weave new information into appropriate sections rather than just appending.`
      : `PATIENT CONTEXT:\n${JSON.stringify(patientContext, null, 2)}\n\n---\n\nVISIT TRANSCRIPT:\n${formattedTranscript}\n\n---\n\nINSTRUCTIONS: Create a new, comprehensive, detailed patient narrative based on this first visit.`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages,
      temperature: 0.3,
      max_tokens: 4000, // Allow for long, detailed responses
    });

    const narrative = completion.choices[0]?.message?.content;
    if (!narrative) {
      throw new Error('No narrative generated from OpenAI');
    }

    console.log('Detailed patient narrative generated successfully');
    console.log('Narrative length:', narrative.length, 'characters');

    return narrative;
  } catch (error: any) {
    console.error('Error generating patient narrative:', error);
    throw new Error(`Failed to generate patient narrative: ${error.message}`);
  }
}

export async function generateClinicalNote(
  formattedTranscript: string,
  patientContext?: any,
  isFirstVisit: boolean = false
): Promise<any> {
  try {
    const basePrompt = `You are an expert medical scribe AI assistant. Your task is to analyze a doctor-patient conversation transcript and generate:

1. **Structured SOAP Note** (Subjective, Objective, Assessment, Plan)
2. **Extracted Orders** (Labs, Imaging, Prescriptions with specific details)
3. **Patient File Updates** (New diagnoses, medications, allergies to add)
4. **Patient-Friendly Summary** (After-visit summary in simple, clear language)

IMPORTANT GUIDELINES:
- Identify which speaker is the doctor and which is the patient based on context
- Extract only factual information stated in the conversation
- For medications, include: drug name, dosage, frequency, duration, route
- For labs/imaging, include: test name, preparation instructions, urgency
- Identify ICD-10 codes when diagnoses are mentioned
- Flag any safety concerns (drug interactions, allergies, red flags)
- The patient summary should be in layperson terms, avoiding medical jargon`;

    const firstVisitAddition = isFirstVisit ? `

**THIS IS A FIRST VISIT - Extract comprehensive patient history:**
- Blood type (if mentioned)
- Past medical history (surgeries, hospitalizations, major illnesses)
- Family medical history (parents, siblings conditions)
- Social history (smoking, alcohol, exercise, occupation)
- Complete medication list (including OTC and supplements)
- Complete allergy list (medications, foods, environmental)
- Chronic conditions and when diagnosed
- Vaccination history (if discussed)
- Current symptoms and when they started

Be thorough in extracting ALL patient background information discussed during this first visit.` : '';

    const systemPrompt = basePrompt + firstVisitAddition + `

Output MUST be valid JSON with this exact structure:
{
  "hpi": "History of present illness - patient's description of symptoms, onset, duration, severity, context",
  "ros": "Review of systems - any other symptoms mentioned",
  "physicalExam": "Physical examination findings as stated by doctor",
  "assessment": "Doctor's clinical assessment and diagnosis",
  "plan": "Treatment plan and follow-up instructions",
  "orders": [
    {
      "type": "LAB_ORDER|IMAGING_ORDER|PRESCRIPTION|FOLLOW_UP",
      "description": "Specific order details",
      "instructions": "Preparation or special instructions",
      "medication": {
        "name": "drug name",
        "dosage": "amount",
        "frequency": "how often",
        "duration": "how long",
        "route": "oral/IV/etc"
      }
    }
  ],
  "patientFileUpdates": {
    "bloodType": "A+|B+|AB+|O+|A-|B-|AB-|O-|null (only if explicitly mentioned)",
    "newDiagnoses": ["diagnosis with ICD-10 if mentioned"],
    "newMedications": ["medication to add to active list"],
    "newAllergies": ["any newly discovered allergies"],
    "newChronicConditions": ["chronic conditions to add to patient file"],
    "pastSurgeries": ["past surgical procedures mentioned"],
    "pastHospitalizations": ["past hospitalizations mentioned"],
    "familyHistory": "Family medical history text",
    "smokingStatus": "smoking status and details if mentioned",
    "alcoholUse": "alcohol consumption details if mentioned",
    "exerciseHabits": "exercise frequency and type if mentioned",
    "occupation": "job/occupation if mentioned",
    "vaccinationHistory": ["vaccinations mentioned"],
    "updatedProblems": ["active problems to update"]
  },
  "patientSummary": "Clear, friendly summary for patient: what we found, what tests/medications were ordered, what to do next, warning signs to watch for",
  "safetyFlags": ["any drug interactions, contraindications, or red flags"],
  "confidenceScore": 0.0-1.0
}`;

    const userPrompt = patientContext
      ? `Patient Context:\n${JSON.stringify(patientContext, null, 2)}\n\n${formattedTranscript}`
      : formattedTranscript;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages,
      temperature: 0.2, // Lower temperature for more consistent medical documentation
      response_format: { type: 'json_object' },
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    const clinicalNote = JSON.parse(response);

    console.log('Clinical note generated successfully');
    console.log('Safety flags:', clinicalNote.safetyFlags?.length || 0);
    console.log('Orders extracted:', clinicalNote.orders?.length || 0);

    return clinicalNote;
  } catch (error: any) {
    console.error('Error generating clinical note:', error);
    throw new Error(`Failed to generate clinical note: ${error.message}`);
  }
}

// Edit content with AI assistance
export async function editContentWithAIAssistant(
  instruction: string,
  currentContent: any
): Promise<string> {
  try {
    console.log('Editing content with AI assistant...');
    console.log('Instruction:', instruction);

    // Extract the comprehensive narrative if it exists
    const contentToEdit = currentContent.comprehensiveNarrative ||
                          JSON.stringify(currentContent, null, 2);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a medical content editor AI. Your role is to help doctors edit medical content based on their instructions.

When given a piece of medical content and an editing instruction:
1. Read the current content carefully
2. Apply the requested changes exactly as instructed
3. Maintain medical accuracy and professionalism
4. Keep the same format and structure unless instructed otherwise
5. Return ONLY the edited content, no explanations

If the instruction is unclear, make reasonable medical assumptions and apply the edits thoughtfully.`
        },
        {
          role: 'user',
          content: `Here is the current medical content:

${contentToEdit}

Please edit it based on this instruction: ${instruction}

Return only the edited content, maintaining the same format.`
        }
      ],
      temperature: 0.3,
    });

    const editedContent = completion.choices[0]?.message?.content;
    if (!editedContent) {
      throw new Error('No response from OpenAI');
    }

    console.log('Content edited successfully');
    return editedContent;
  } catch (error: any) {
    console.error('Error editing content with AI:', error);
    throw new Error(`Failed to edit content: ${error.message}`);
  }
}
