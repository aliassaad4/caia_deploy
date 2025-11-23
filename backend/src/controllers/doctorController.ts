import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma, io } from '../index';
import { AppError } from '../middleware/errorHandler';
import { transcribeAudio, uploadAudioForTranscription, formatTranscriptForGPT } from '../services/assemblyaiService';
import { generateClinicalNote } from '../services/openaiService';
import { processRecordingInBackground } from '../services/visitProcessingService';

// Dashboard stats
export const getDashboardStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Today's appointments
    const todayAppointments = await prisma.visit.count({
      where: {
        providerId: req.user.id,
        scheduledAt: {
          gte: today,
          lt: tomorrow,
        },
        status: {
          in: ['SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS'],
        },
      },
    });

    // Pending approvals
    const pendingApprovals = await prisma.approvalQueue.count({
      where: {
        status: 'PENDING',
      },
    });

    // Q-Board items
    const qBoardItems = await prisma.qBoard.count({
      where: {
        status: {
          in: ['PENDING', 'IN_REVIEW'],
        },
      },
    });

    res.json({
      status: 'success',
      data: {
        todayAppointments,
        pendingApprovals,
        qBoardItems,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get approval queue
export const getApprovalQueue = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const approvals = await prisma.approvalQueue.findMany({
      where: {
        status: {
          in: ['PENDING', 'IN_REVIEW', 'NEEDS_REVISION'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    res.json({
      status: 'success',
      data: approvals,
    });
  } catch (error) {
    next(error);
  }
};

// Approve content
export const approveContent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;
    const { editedContent } = req.body;

    const approval = await prisma.approvalQueue.findUnique({
      where: { id },
    });

    if (!approval) {
      throw new AppError('Approval item not found', 404);
    }

    // Update approval status
    const updated = await prisma.approvalQueue.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
        draftContent: editedContent || approval.draftContent,
      },
    });

    // If it's a clinical note, update the visit
    if (approval.contentType === 'CLINICAL_NOTE') {
      const content = editedContent || approval.draftContent;
      await prisma.visit.update({
        where: { id: approval.contentId },
        data: {
          assessment: (content as any).assessment,
          plan: (content as any).plan,
          patientSummary: (content as any).patientSummary,
          noteApproved: true,
          approvedAt: new Date(),
          approvedBy: req.user.id,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      // Approve all related tasks for this visit (so patient can see them)
      await prisma.task.updateMany({
        where: {
          visitId: approval.contentId,
          requiresApproval: true,
          approvedAt: null,
        },
        data: {
          approvedBy: req.user.id,
          approvedAt: new Date(),
        },
      });

      // Generate comprehensive patient file after visit completion
      const { updatePatientFileAfterVisit } = await import('./patientChartController');
      try {
        await updatePatientFileAfterVisit(approval.contentId);
      } catch (error) {
        console.error('Error updating patient file:', error);
        // Don't fail the approval if file generation fails
      }
    }

    // If it's a patient profile update, update the clinical profile
    if (approval.contentType === 'PATIENT_PROFILE_UPDATE') {
      const content = editedContent || approval.draftContent;
      const proposedUpdates = (content as any).proposedUpdates;
      const patientId = approval.contentId; // For profile updates, contentId is the patient ID

      // Get or create clinical profile
      let clinicalProfile = await prisma.clinicalProfile.findUnique({
        where: { patientId },
      });

      if (!clinicalProfile) {
        clinicalProfile = await prisma.clinicalProfile.create({
          data: {
            patientId,
            allergies: [],
            chronicConditions: [],
            currentMedications: [],
            pastSurgeries: [],
            activeProblems: [],
          },
        });
      }

      // Prepare update data
      const updateData: any = {};

      // Update blood type
      if (proposedUpdates.bloodType) {
        updateData.bloodType = proposedUpdates.bloodType;
      }

      // Merge arrays (avoiding duplicates)
      if (proposedUpdates.newAllergies && proposedUpdates.newAllergies.length > 0) {
        const currentAllergies = clinicalProfile.allergies || [];
        updateData.allergies = [
          ...new Set([...currentAllergies, ...proposedUpdates.newAllergies]),
        ];
      }

      if (proposedUpdates.newMedications && proposedUpdates.newMedications.length > 0) {
        const currentMeds = clinicalProfile.currentMedications || [];
        updateData.currentMedications = [
          ...new Set([...currentMeds, ...proposedUpdates.newMedications]),
        ];
      }

      if (proposedUpdates.newChronicConditions && proposedUpdates.newChronicConditions.length > 0) {
        const currentConditions = clinicalProfile.chronicConditions || [];
        updateData.chronicConditions = [
          ...new Set([...currentConditions, ...proposedUpdates.newChronicConditions]),
        ];
      }

      if (proposedUpdates.pastSurgeries && proposedUpdates.pastSurgeries.length > 0) {
        const currentSurgeries = clinicalProfile.pastSurgeries || [];
        updateData.pastSurgeries = [
          ...new Set([...currentSurgeries, ...proposedUpdates.pastSurgeries]),
        ];
      }

      if (proposedUpdates.updatedProblems && proposedUpdates.updatedProblems.length > 0) {
        const currentProblems = clinicalProfile.activeProblems || [];
        updateData.activeProblems = [
          ...new Set([...currentProblems, ...proposedUpdates.updatedProblems]),
        ];
      }

      // Update family history
      if (proposedUpdates.familyHistory) {
        updateData.familyHistory = proposedUpdates.familyHistory;
      }

      // Update social history fields
      if (proposedUpdates.smokingStatus) {
        updateData.smokingStatus = proposedUpdates.smokingStatus;
      }

      if (proposedUpdates.alcoholUse) {
        updateData.alcoholUse = proposedUpdates.alcoholUse;
      }

      if (proposedUpdates.exerciseHabits) {
        updateData.exerciseHabits = proposedUpdates.exerciseHabits;
      }

      if (proposedUpdates.occupation) {
        updateData.occupation = proposedUpdates.occupation;
      }

      // Update vaccination history
      if (proposedUpdates.vaccinationHistory && proposedUpdates.vaccinationHistory.length > 0) {
        const currentVaccinations = clinicalProfile.vaccinationHistory || [];
        updateData.vaccinationHistory = [
          ...new Set([...currentVaccinations, ...proposedUpdates.vaccinationHistory]),
        ];
      }

      // Update past hospitalizations
      if (proposedUpdates.pastHospitalizations && proposedUpdates.pastHospitalizations.length > 0) {
        const currentHospitalizations = clinicalProfile.pastHospitalizations || [];
        updateData.pastHospitalizations = [
          ...new Set([...currentHospitalizations, ...proposedUpdates.pastHospitalizations]),
        ];
      }

      // Apply updates to clinical profile
      await prisma.clinicalProfile.update({
        where: { patientId },
        data: updateData,
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          actorType: 'doctor',
          actorId: req.user.id,
          action: 'update',
          resourceType: 'clinical_profile',
          resourceId: patientId,
          changes: updateData,
          rationale: 'Patient profile updated from visit recording',
        },
      });
    }

    res.json({
      status: 'success',
      message: 'Content approved successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// Reject content
export const rejectContent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;
    const { reason } = req.body;

    const approval = await prisma.approvalQueue.findUnique({
      where: { id },
    });

    if (!approval) {
      throw new AppError('Approval item not found', 404);
    }

    // Update approval status to rejected
    const updated = await prisma.approvalQueue.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
        editHistory: {
          rejectedAt: new Date().toISOString(),
          rejectedBy: req.user.id,
          reason: reason || 'No reason provided',
        } as any,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorType: 'doctor',
        actorId: req.user.id,
        action: 'reject',
        resourceType: 'approval_queue',
        resourceId: id,
        metadata: {
          contentType: approval.contentType,
          contentId: approval.contentId,
          reason: reason || 'No reason provided',
        },
        rationale: `Content rejected: ${reason || 'No reason provided'}`,
      },
    });

    res.json({
      status: 'success',
      message: 'Content rejected successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// Edit content with AI assistance
export const editContentWithAI = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;
    const { instruction, currentContent } = req.body;

    if (!instruction || !instruction.trim()) {
      throw new AppError('Instruction is required', 400);
    }

    const approval = await prisma.approvalQueue.findUnique({
      where: { id },
    });

    if (!approval) {
      throw new AppError('Approval item not found', 404);
    }

    // Import the OpenAI service function
    const { editContentWithAIAssistant } = require('../services/openaiService');

    // Call AI to edit content
    const updatedContent = await editContentWithAIAssistant(
      instruction,
      currentContent
    );

    res.json({
      status: 'success',
      message: 'Content edited successfully',
      data: {
        updatedContent,
        parsedContent: currentContent, // In a real scenario, we'd parse the AI response
      },
    });
  } catch (error) {
    next(error);
  }
};

// Update approval content
export const updateApprovalContent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;
    const { draftContent } = req.body;

    const approval = await prisma.approvalQueue.findUnique({
      where: { id },
    });

    if (!approval) {
      throw new AppError('Approval item not found', 404);
    }

    const updated = await prisma.approvalQueue.update({
      where: { id },
      data: {
        draftContent: draftContent as any,
        editHistory: {
          ...(approval.editHistory as any || {}),
          lastEditedAt: new Date().toISOString(),
          lastEditedBy: req.user.id,
        } as any,
      },
    });

    res.json({
      status: 'success',
      message: 'Content updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// Get Q-Board
export const getQBoard = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const qBoardItems = await prisma.qBoard.findMany({
      where: {
        status: {
          in: ['PENDING', 'IN_REVIEW'],
        },
      },
      orderBy: [
        { urgency: 'desc' },
        { createdAt: 'asc' },
      ],
      take: 50,
    });

    res.json({
      status: 'success',
      data: qBoardItems,
    });
  } catch (error) {
    next(error);
  }
};

// Respond to Q-Board item
export const respondToQBoard = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;
    const { response } = req.body;

    if (!response) {
      throw new AppError('Response required', 400);
    }

    const qBoard = await prisma.qBoard.update({
      where: { id },
      data: {
        response,
        respondedBy: req.user.id,
        respondedAt: new Date(),
        status: 'RESPONDED',
        resolvedAt: new Date(),
      },
    });

    // Create a message to patient
    await prisma.message.create({
      data: {
        patientId: qBoard.patientId,
        content: `Doctor's response: ${response}`,
        sender: 'DOCTOR',
        messageType: 'TEXT',
      },
    });

    res.json({
      status: 'success',
      message: 'Response sent to patient',
      data: qBoard,
    });
  } catch (error) {
    next(error);
  }
};

// Get today's patients
export const getTodayPatients = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const visits = await prisma.visit.findMany({
      where: {
        providerId: req.user.id,
        scheduledAt: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: {
        scheduledAt: 'asc',
      },
    });

    res.json({
      status: 'success',
      data: visits,
    });
  } catch (error) {
    next(error);
  }
};

// Get completed visits
export const getCompletedVisits = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const visits = await prisma.visit.findMany({
      where: {
        providerId: req.user.id,
        status: 'COMPLETED',
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
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
      data: visits,
    });
  } catch (error) {
    next(error);
  }
};

// Get patient details
export const getPatientDetails = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { patientId } = req.params;

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        clinicalProfile: true,
        visits: {
          orderBy: { scheduledAt: 'desc' },
          take: 10,
        },
        tasks: {
          where: {
            status: {
              in: ['PENDING', 'IN_PROGRESS'],
            },
          },
        },
      },
    });

    if (!patient) {
      throw new AppError('Patient not found', 404);
    }

    res.json({
      status: 'success',
      data: patient,
    });
  } catch (error) {
    next(error);
  }
};

// Process visit audio recording (ASYNC - returns immediately)
export const processVisitRecording = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { visitId } = req.params;
    const audioFile = req.file;

    if (!audioFile) {
      throw new AppError('Audio file required', 400);
    }

    // Get visit details
    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
    });

    if (!visit) {
      throw new AppError('Visit not found', 404);
    }

    console.log(`Received recording upload for visit ${visitId}, starting background processing...`);

    // Update status to uploading (immediately)
    await prisma.visit.update({
      where: { id: visitId },
      data: { processingStatus: 'uploading' },
    });

    // Start background processing (don't await - let it run in background)
    processRecordingInBackground(visitId, audioFile.buffer, visit.patientId, io).catch((err) => {
      console.error('Background processing error:', err);
    });

    // Return immediately to allow doctor to continue working
    res.json({
      status: 'success',
      message: 'Recording uploaded successfully. Processing in background...',
      data: {
        visitId,
        processingStatus: 'uploading',
      },
    });
  } catch (error: any) {
    console.error('Error receiving recording:', error);
    next(error);
  }
};

// Get visit processing status (new endpoint)
export const getVisitProcessingStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { visitId } = req.params;

    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      select: {
        id: true,
        processingStatus: true,
        processingError: true,
        hpiDraft: true,
        examFindings: true,
      },
    });

    if (!visit) {
      throw new AppError('Visit not found', 404);
    }

    res.json({
      status: 'success',
      data: visit,
    });
  } catch (error) {
    next(error);
  }
};

// Get all patients for this doctor
export const getAllPatients = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    // Get all unique patients that have visits with this doctor
    const patients = await prisma.patient.findMany({
      where: {
        visits: {
          some: {
            providerId: req.user.id,
          },
        },
      },
      include: {
        clinicalProfile: true,
        visits: {
          where: {
            providerId: req.user.id,
            status: 'COMPLETED', // Only show completed visits
          },
          orderBy: {
            completedAt: 'desc', // Sort by completion date, not scheduled date
          },
          take: 1, // Get only the most recent completed visit for the list view
        },
      },
      orderBy: {
        lastName: 'asc',
      },
    });

    res.json({
      status: 'success',
      data: patients,
    });
  } catch (error) {
    next(error);
  }
};

// Get detailed patient profile with full visit history
export const getPatientFullProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { patientId } = req.params;

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        clinicalProfile: true,
        patientChart: true,
        visits: {
          where: {
            providerId: req.user.id,
            status: 'COMPLETED',
          },
          orderBy: {
            completedAt: 'desc',
          },
          include: {
            provider: {
              select: {
                firstName: true,
                lastName: true,
                specialty: true,
              },
            },
          },
        },
      },
    });

    // Get files that have been reviewed (READ status) by this doctor
    const reviewedFileNotifications = await prisma.fileNotification.findMany({
      where: {
        patientId: patientId,
        doctorId: req.user.id,
        status: 'READ',
        file: {
          deletedAt: null,
        },
      },
      orderBy: {
        readAt: 'desc',
      },
      include: {
        file: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            fileSize: true,
            fileCategory: true,
            storageUrl: true,
            description: true,
            createdAt: true,
            visitId: true,
          },
        },
      },
    });

    // Extract the files from notifications
    const reviewedFiles = reviewedFileNotifications
      .filter(n => n.file)
      .map(n => ({
        ...n.file,
        reviewedAt: n.readAt,
      }));

    if (!patient) {
      throw new AppError('Patient not found', 404);
    }

    // Generate AI summary of patient
    const lastVisit = patient.visits[0];
    const visitCount = patient.visits.length;

    const summary = {
      patientInfo: {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
        dateOfBirth: patient.dateOfBirth,
        email: patient.email,
        phone: patient.phone,
        initialConsultationReason: patient.initialConsultationReason,
        initialConsultationDate: patient.initialConsultationDate,
        initialConsultationNotes: patient.initialConsultationNotes,
      },
      nextMeeting: {
        scheduled: patient.nextMeetingScheduled,
        recommendedBy: patient.nextMeetingRecommendedBy,
        recommendedAfter: patient.nextMeetingRecommendedAfter,
        reason: patient.nextMeetingReason,
      },
      clinicalProfile: patient.clinicalProfile,
      patientChart: patient.patientChart,
      visitSummary: {
        totalVisits: visitCount,
        lastVisit: lastVisit ? {
          date: lastVisit.completedAt,
          reason: lastVisit.reasonForVisit,
          hpi: lastVisit.hpiDraft,
          assessment: lastVisit.assessment,
          plan: lastVisit.plan,
        } : null,
      },
      allVisits: patient.visits,
      files: reviewedFiles,
    };

    res.json({
      status: 'success',
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

// Ask AI questions about patient profile
export const askPatientProfileQuestion = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { patientId } = req.params;
    const { question } = req.body;

    if (!question) {
      throw new AppError('Question is required', 400);
    }

    // Get patient profile
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        clinicalProfile: true,
        visits: {
          where: {
            providerId: req.user.id,
            status: 'COMPLETED',
          },
          orderBy: {
            completedAt: 'desc',
          },
          take: 5, // Last 5 visits
        },
      },
    });

    if (!patient) {
      throw new AppError('Patient not found', 404);
    }

    // Import OpenAI
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const systemPrompt = `You are a medical AI assistant helping a doctor review patient information.
Answer the doctor's questions based on the patient's clinical profile and visit history.
Be concise, accurate, and highlight important clinical information.
If information is not available in the patient's record, clearly state that.`;

    const patientContext = `
Patient: ${patient.firstName} ${patient.lastName}
Date of Birth: ${patient.dateOfBirth}

Clinical Profile:
- Blood Type: ${patient.clinicalProfile?.bloodType || 'Not recorded'}
- Allergies: ${patient.clinicalProfile?.allergies?.join(', ') || 'None recorded'}
- Current Medications: ${patient.clinicalProfile?.currentMedications?.join(', ') || 'None recorded'}
- Chronic Conditions: ${patient.clinicalProfile?.chronicConditions?.join(', ') || 'None recorded'}
- Past Surgeries: ${patient.clinicalProfile?.pastSurgeries?.join(', ') || 'None recorded'}
- Past Hospitalizations: ${patient.clinicalProfile?.pastHospitalizations?.join(', ') || 'None recorded'}
- Family History: ${patient.clinicalProfile?.familyHistory || 'Not recorded'}
- Smoking Status: ${patient.clinicalProfile?.smokingStatus || 'Not recorded'}
- Alcohol Use: ${patient.clinicalProfile?.alcoholUse || 'Not recorded'}
- Exercise Habits: ${patient.clinicalProfile?.exerciseHabits || 'Not recorded'}
- Occupation: ${patient.clinicalProfile?.occupation || 'Not recorded'}
- Active Problems: ${patient.clinicalProfile?.activeProblems?.join(', ') || 'None recorded'}

Recent Visit History:
${patient.visits.map((visit, index) => `
Visit ${index + 1} (${new Date(visit.completedAt!).toLocaleDateString()}):
- Reason: ${visit.reasonForVisit}
- Assessment: ${visit.assessment || 'Not recorded'}
- Plan: ${visit.plan || 'Not recorded'}
`).join('\n')}
`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Patient Context:\n${patientContext}\n\nDoctor's Question: ${question}` },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const answer = completion.choices[0]?.message?.content;

    res.json({
      status: 'success',
      data: {
        question,
        answer,
      },
    });
  } catch (error: any) {
    console.error('Error answering patient question:', error);
    next(error);
  }
};

// Search patients by name or email
export const searchPatients = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      throw new AppError('Search query is required', 400);
    }

    const searchTerm = q.toLowerCase();

    const patients = await prisma.patient.findMany({
      where: {
        OR: [
          { firstName: { contains: searchTerm, mode: 'insensitive' } },
          { lastName: { contains: searchTerm, mode: 'insensitive' } },
          { email: { contains: searchTerm, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        dateOfBirth: true,
      },
      take: 10,
    });

    res.json({
      status: 'success',
      data: patients,
    });
  } catch (error) {
    next(error);
  }
};

// Manually create a visit (for testing/urgent cases)
export const createManualVisit = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { patientId, reasonForVisit, visitType, durationMinutes } = req.body;

    if (!patientId || !reasonForVisit) {
      throw new AppError('Patient ID and reason for visit are required', 400);
    }

    // Verify patient exists
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    });

    if (!patient) {
      throw new AppError('Patient not found', 404);
    }

    // Create the visit with current time
    const visit = await prisma.visit.create({
      data: {
        patientId,
        providerId: req.user.id,
        scheduledAt: new Date(), // Use current time
        status: 'IN_PROGRESS',
        visitType: visitType || 'urgent',
        reasonForVisit,
        durationMinutes: durationMinutes || 30,
        priorityScore: 7, // High priority for manual visits
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorType: 'doctor',
        actorId: req.user.id,
        action: 'create',
        resourceType: 'visit',
        resourceId: visit.id,
        metadata: {
          manual: true,
          patientId,
          reasonForVisit,
        },
        rationale: 'Manual visit created by doctor',
      },
    });

    res.json({
      status: 'success',
      message: 'Visit created successfully',
      data: visit,
    });
  } catch (error) {
    next(error);
  }
};

// Get visit summary for patient-friendly after-visit summary
export const getVisitSummary = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { visitId } = req.params;

    // Fetch the visit with all relevant data
    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      include: {
        patient: {
          include: {
            clinicalProfile: true,
          },
        },
        provider: {
          select: {
            firstName: true,
            lastName: true,
            specialty: true,
          },
        },
      },
    });

    if (!visit) {
      throw new AppError('Visit not found', 404);
    }

    // Verify the doctor has access to this visit
    if (visit.providerId !== req.user.id) {
      throw new AppError('Not authorized to view this visit', 403);
    }

    // Build the patient-friendly summary structure
    const summary = {
      visitInfo: {
        date: visit.completedAt || visit.scheduledAt,
        visitType: visit.visitType,
        reasonForVisit: visit.reasonForVisit,
        duration: visit.durationMinutes,
        provider: visit.provider ? `Dr. ${visit.provider.firstName} ${visit.provider.lastName}` : 'Provider',
        specialty: visit.provider?.specialty || 'General Practice',
      },
      patient: {
        name: `${visit.patient.firstName} ${visit.patient.lastName}`,
        email: visit.patient.email,
        phone: visit.patient.phone,
      },
      clinicalSummary: {
        chiefComplaint: visit.chiefComplaint || visit.reasonForVisit,
        diagnosis: visit.assessment || 'Assessment pending',
        diagnosisSimple: simplifyDiagnosis(visit.assessment),
      },
      medications: extractMedications(visit.plan, visit.patient.clinicalProfile?.currentMedications),
      tests: extractTests(visit.plan),
      instructions: {
        plan: visit.plan || 'No specific plan documented',
        patientInstructions: visit.patientInstructions || generateDefaultInstructions(visit),
      },
      faqs: generateFAQs(visit),
      warningSignsAndFollowUp: generateWarnings(visit),
      patientSummary: visit.patientSummary || generatePatientSummary(visit),
    };

    res.json({
      status: 'success',
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

// Helper functions for generating summary sections

function simplifyDiagnosis(assessment: string | null): string {
  if (!assessment) return 'Your doctor will discuss your diagnosis with you.';

  // Create a simplified version of the assessment
  const simplified = assessment
    .replace(/\b(dx|diagnosis|assessment|impression)\b:?\s*/gi, '')
    .replace(/\b(r\/o|rule out)\b/gi, 'possible')
    .replace(/\b(s\/p|status post)\b/gi, 'after')
    .replace(/\b(hx|history)\b/gi, 'history of')
    .trim();

  return simplified || 'Your doctor will discuss your diagnosis with you.';
}

function extractMedications(plan: string | null, currentMeds: string[] | null | undefined): Array<{name: string; instructions: string}> {
  const medications: Array<{name: string; instructions: string}> = [];

  if (plan) {
    // Look for medication patterns in the plan
    const medPatterns = [
      /(?:prescribe|start|continue|take)\s+([A-Za-z]+(?:\s+\d+\s*mg)?)\s*[-–]?\s*([^.;]+)?/gi,
      /([A-Za-z]+)\s+(\d+\s*mg)\s*(?:daily|twice|once|BID|TID|QD|PRN)?\s*[-–]?\s*([^.;]+)?/gi,
    ];

    for (const pattern of medPatterns) {
      const matches = plan.matchAll(pattern);
      for (const match of matches) {
        medications.push({
          name: match[1] + (match[2] ? ` ${match[2]}` : ''),
          instructions: match[3] || 'Take as directed by your doctor',
        });
      }
    }
  }

  // Add current medications if no new ones found
  if (medications.length === 0 && currentMeds && currentMeds.length > 0) {
    currentMeds.forEach(med => {
      medications.push({
        name: med,
        instructions: 'Continue as previously prescribed',
      });
    });
  }

  return medications.length > 0 ? medications : [{
    name: 'No new medications',
    instructions: 'Continue any current medications as prescribed',
  }];
}

function extractTests(plan: string | null): Array<{name: string; prepInstructions: string}> {
  const tests: Array<{name: string; prepInstructions: string}> = [];

  if (plan) {
    const testPatterns = [
      /(?:order|schedule|get|perform)\s+((?:blood|urine|lab|x-?ray|CT|MRI|ultrasound|ECG|EKG)[^.;,]+)/gi,
      /(CBC|BMP|CMP|lipid panel|A1C|TSH|urinalysis|chest x-?ray)/gi,
    ];

    for (const pattern of testPatterns) {
      const matches = plan.matchAll(pattern);
      for (const match of matches) {
        const testName = match[1].trim();
        tests.push({
          name: testName,
          prepInstructions: getTestPrep(testName),
        });
      }
    }
  }

  return tests.length > 0 ? tests : [{
    name: 'No tests ordered',
    prepInstructions: 'No preparation needed at this time',
  }];
}

function getTestPrep(testName: string): string {
  const testLower = testName.toLowerCase();

  if (testLower.includes('fasting') || testLower.includes('glucose') || testLower.includes('lipid')) {
    return 'Fast for 8-12 hours before the test. Water is okay.';
  }
  if (testLower.includes('urine') || testLower.includes('urinalysis')) {
    return 'Collect a mid-stream urine sample in a clean container.';
  }
  if (testLower.includes('blood')) {
    return 'Stay hydrated. Wear loose-fitting sleeves for easy blood draw.';
  }
  if (testLower.includes('x-ray') || testLower.includes('imaging')) {
    return 'Remove jewelry and metal objects. Wear comfortable clothing.';
  }
  if (testLower.includes('ct') || testLower.includes('mri')) {
    return 'Inform staff if you have any metal implants. You may need to fast.';
  }

  return 'Follow any specific instructions provided by the lab or imaging center.';
}

function generateDefaultInstructions(visit: any): string {
  const instructions: string[] = [];

  instructions.push('Follow up with your doctor as recommended.');

  if (visit.plan) {
    instructions.push('Take all medications as prescribed.');
  }

  instructions.push('Call our office if symptoms worsen or new symptoms develop.');
  instructions.push('Keep all scheduled appointments and tests.');

  return instructions.join(' ');
}

function generateFAQs(visit: any): Array<{question: string; answer: string}> {
  const faqs: Array<{question: string; answer: string}> = [];

  faqs.push({
    question: 'When should I call the doctor?',
    answer: 'Call if your symptoms get worse, you develop new symptoms, or you have concerns about your medications.',
  });

  faqs.push({
    question: 'Can I continue my normal activities?',
    answer: 'Unless otherwise instructed, you can continue your normal activities. Rest if you feel tired.',
  });

  faqs.push({
    question: 'How do I refill my medications?',
    answer: 'Contact our office or your pharmacy at least 3-5 days before running out of medication.',
  });

  if (visit.visitType === 'follow_up') {
    faqs.push({
      question: 'When is my next appointment?',
      answer: 'Please schedule your follow-up appointment at the front desk or call our office.',
    });
  }

  return faqs;
}

function generateWarnings(visit: any): {warningSigns: string[]; followUp: string} {
  const warningSignsSet = new Set<string>();

  // Common warning signs
  warningSignsSet.add('Fever over 101°F (38.3°C) lasting more than 2 days');
  warningSignsSet.add('Severe or worsening pain');
  warningSignsSet.add('Difficulty breathing or shortness of breath');
  warningSignsSet.add('Confusion or changes in mental status');

  // Add condition-specific warnings based on reason for visit
  const reason = (visit.reasonForVisit || '').toLowerCase();

  if (reason.includes('chest') || reason.includes('heart')) {
    warningSignsSet.add('Chest pain or pressure spreading to arm, jaw, or back');
    warningSignsSet.add('Sudden dizziness or fainting');
  }

  if (reason.includes('respiratory') || reason.includes('breathing') || reason.includes('cough')) {
    warningSignsSet.add('Coughing up blood');
    warningSignsSet.add('Bluish discoloration of lips or fingers');
  }

  if (reason.includes('abdominal') || reason.includes('stomach') || reason.includes('pain')) {
    warningSignsSet.add('Severe abdominal pain or rigidity');
    warningSignsSet.add('Blood in stool or vomit');
  }

  return {
    warningSigns: Array.from(warningSignsSet),
    followUp: visit.plan?.includes('follow')
      ? 'Schedule a follow-up appointment as recommended by your doctor.'
      : 'Contact our office if you need to schedule a follow-up visit.',
  };
}

function generatePatientSummary(visit: any): string {
  const parts: string[] = [];

  parts.push(`Visit Date: ${new Date(visit.completedAt || visit.scheduledAt).toLocaleDateString()}`);
  parts.push(`Reason for Visit: ${visit.reasonForVisit}`);

  if (visit.assessment) {
    parts.push(`\nDiagnosis: ${simplifyDiagnosis(visit.assessment)}`);
  }

  if (visit.plan) {
    parts.push(`\nTreatment Plan: ${visit.plan}`);
  }

  parts.push('\nPlease follow all instructions provided and contact us with any questions.');

  return parts.join('\n');
}
