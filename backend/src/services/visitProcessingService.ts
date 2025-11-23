import { prisma } from '../index';
import { transcribeAudio, uploadAudioForTranscription, formatTranscriptForGPT } from './assemblyaiService';
import { generateClinicalNote, generateDetailedPatientNarrative } from './openaiService';
import { getOrCreatePatientChart } from '../controllers/patientChartController';
import { Server as SocketServer } from 'socket.io';

// Background processing function (runs without blocking the response)
export const processRecordingInBackground = async (
  visitId: string,
  audioBuffer: Buffer,
  patientId: string,
  io?: SocketServer
) => {
  try {
    console.log(`[Background] Starting processing for visit ${visitId}...`);

    // Update status to transcribing
    await prisma.visit.update({
      where: { id: visitId },
      data: { processingStatus: 'transcribing' },
    });

    // Step 1: Upload audio to AssemblyAI
    const audioUrl = await uploadAudioForTranscription(audioBuffer);

    // Step 2: Transcribe with speaker diarization
    const transcriptResult = await transcribeAudio(audioUrl);

    // Update status to generating notes
    await prisma.visit.update({
      where: { id: visitId },
      data: { processingStatus: 'generating_notes' },
    });

    // Step 3: Format transcript for GPT
    const formattedTranscript = formatTranscriptForGPT(transcriptResult);

    // Step 4: Get visit with patient details
    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      include: {
        patient: {
          include: {
            clinicalProfile: true,
          },
        },
      },
    });

    if (!visit) {
      throw new Error('Visit not found');
    }

    // Step 5: Determine if this is a first visit
    const previousVisits = await prisma.visit.count({
      where: {
        patientId: visit.patientId,
        status: 'COMPLETED',
        id: { not: visitId },
      },
    });
    const isFirstVisit = previousVisits === 0;

    // Step 6: Generate clinical note with GPT
    const patientContext = {
      firstName: visit.patient.firstName,
      lastName: visit.patient.lastName,
      allergies: visit.patient.clinicalProfile?.allergies || [],
      currentMedications: visit.patient.clinicalProfile?.currentMedications || [],
      chronicConditions: visit.patient.clinicalProfile?.chronicConditions || [],
      reasonForVisit: visit.reasonForVisit,
      isFirstVisit,
      existingProfile: visit.patient.clinicalProfile ? {
        bloodType: visit.patient.clinicalProfile.bloodType,
        pastSurgeries: visit.patient.clinicalProfile.pastSurgeries,
        familyHistory: visit.patient.clinicalProfile.familyHistory,
      } : null,
    };

    const clinicalNote = await generateClinicalNote(formattedTranscript, patientContext, isFirstVisit);

    // Step 6a: Generate/Update detailed patient narrative
    console.log(`[Background] Generating detailed patient narrative for visit ${visitId}...`);

    // Get existing narrative from patient chart
    const chart = await getOrCreatePatientChart(visit.patientId);
    const existingNarrative = chart.comprehensivePatientFile || undefined;

    // Generate detailed narrative (either new or updated)
    const detailedNarrative = await generateDetailedPatientNarrative(
      formattedTranscript,
      {
        ...patientContext,
        visitDate: visit.scheduledAt,
        visitReason: visit.reasonForVisit,
      },
      existingNarrative
    );

    // Update patient chart with new narrative
    await prisma.patientChart.update({
      where: { id: chart.id },
      data: {
        comprehensivePatientFile: detailedNarrative,
        fileLastUpdatedFrom: `visit_${visitId}`,
        lastReviewedAt: new Date(),
      },
    });

    console.log(`[Background] Detailed narrative updated (${detailedNarrative.length} characters)`);

    // Step 7: Update visit with transcript data
    await prisma.visit.update({
      where: { id: visitId },
      data: {
        transcriptData: {
          raw: transcriptResult,
          formatted: formattedTranscript,
          confidence: transcriptResult.confidence,
        } as any,
        hpiDraft: clinicalNote.hpi,
        examFindings: clinicalNote.physicalExam,
        processingStatus: 'completed',
      },
    });

    // Step 8: Create approval queue entries
    const clinicalNoteData = {
      hpi: clinicalNote.hpi,
      ros: clinicalNote.ros,
      physicalExam: clinicalNote.physicalExam,
      assessment: clinicalNote.assessment,
      plan: clinicalNote.plan,
      orders: clinicalNote.orders || [],
      patientSummary: clinicalNote.patientSummary,
      safetyFlags: clinicalNote.safetyFlags || [],
      confidenceScore: clinicalNote.confidenceScore,
    };

    await prisma.approvalQueue.create({
      data: {
        contentType: 'CLINICAL_NOTE',
        contentId: visitId,
        patientId: visit.patientId,
        draftContent: clinicalNoteData,
        aiGenerated: true,
        confidenceScore: clinicalNote.confidenceScore || null,
        suggestedEdits: clinicalNote.safetyFlags || [],
        status: 'PENDING',
      },
    });

    // Step 8a: Create tasks from extracted orders (for patient to complete)
    if (clinicalNote.orders && clinicalNote.orders.length > 0) {
      console.log(`[Background] Creating ${clinicalNote.orders.length} tasks from orders...`);

      for (const order of clinicalNote.orders) {
        let taskType: 'LAB_ORDER' | 'IMAGING_ORDER' | 'PRESCRIPTION' | 'FOLLOW_UP' | 'ADMINISTRATIVE' = 'ADMINISTRATIVE';
        let title = order.description || 'Medical Task';
        let priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' = 'MEDIUM';

        // Map order types to task types
        if (order.type === 'LAB_ORDER') {
          taskType = 'LAB_ORDER';
          title = `Lab Order: ${order.description}`;
          priority = 'HIGH';
        } else if (order.type === 'IMAGING_ORDER') {
          taskType = 'IMAGING_ORDER';
          title = `Imaging Order: ${order.description}`;
          priority = 'HIGH';
        } else if (order.type === 'PRESCRIPTION') {
          taskType = 'PRESCRIPTION';
          title = `Prescription: ${order.medication?.name || order.description}`;
          priority = 'MEDIUM';
        } else if (order.type === 'FOLLOW_UP') {
          taskType = 'FOLLOW_UP';
          title = `Follow-up: ${order.description}`;
          priority = 'MEDIUM';
        } else if (order.type === 'REFERRAL') {
          taskType = 'ADMINISTRATIVE';
          title = `Referral: ${order.description}`;
          priority = 'HIGH';
        }

        // Create the task (initially pending approval)
        await prisma.task.create({
          data: {
            patientId: visit.patientId,
            taskType,
            title,
            description: order.instructions || order.description,
            priority,
            status: 'PENDING',
            visitId,
            orderDetails: order,
            requiresApproval: true, // Doctor needs to approve before patient sees it
          },
        });
      }

      console.log(`[Background] Created ${clinicalNote.orders.length} tasks for patient`);
    }

    // Step 9: Patient profile updates approval (if there are updates)
    const profileUpdates = clinicalNote.patientFileUpdates || {};
    const hasProfileUpdates =
      profileUpdates.bloodType ||
      (profileUpdates.newDiagnoses && profileUpdates.newDiagnoses.length > 0) ||
      (profileUpdates.newMedications && profileUpdates.newMedications.length > 0) ||
      (profileUpdates.newAllergies && profileUpdates.newAllergies.length > 0) ||
      (profileUpdates.newChronicConditions && profileUpdates.newChronicConditions.length > 0) ||
      (profileUpdates.pastSurgeries && profileUpdates.pastSurgeries.length > 0) ||
      (profileUpdates.pastHospitalizations && profileUpdates.pastHospitalizations.length > 0) ||
      profileUpdates.familyHistory ||
      profileUpdates.smokingStatus ||
      profileUpdates.alcoholUse ||
      profileUpdates.exerciseHabits ||
      profileUpdates.occupation ||
      (profileUpdates.vaccinationHistory && profileUpdates.vaccinationHistory.length > 0) ||
      (profileUpdates.updatedProblems && profileUpdates.updatedProblems.length > 0);

    if (hasProfileUpdates) {
      const currentProfile = visit.patient.clinicalProfile;

      // Get the updated comprehensive narrative from the patient chart
      const updatedChart = await prisma.patientChart.findUnique({
        where: { patientId: visit.patientId },
      });

      await prisma.approvalQueue.create({
        data: {
          contentType: 'PATIENT_PROFILE_UPDATE',
          contentId: visit.patient.id,
          patientId: visit.patientId,
          draftContent: {
            isFirstVisit,
            visitId,
            currentProfile: {
              bloodType: currentProfile?.bloodType || null,
              allergies: currentProfile?.allergies || [],
              currentMedications: currentProfile?.currentMedications || [],
              chronicConditions: currentProfile?.chronicConditions || [],
              pastSurgeries: currentProfile?.pastSurgeries || [],
              familyHistory: currentProfile?.familyHistory || null,
              smokingStatus: currentProfile?.smokingStatus || null,
              alcoholUse: currentProfile?.alcoholUse || null,
              exerciseHabits: currentProfile?.exerciseHabits || null,
              occupation: currentProfile?.occupation || null,
              vaccinationHistory: currentProfile?.vaccinationHistory || [],
              pastHospitalizations: currentProfile?.pastHospitalizations || [],
              activeProblems: currentProfile?.activeProblems || [],
            },
            proposedUpdates: profileUpdates,
            comprehensiveNarrative: updatedChart?.comprehensivePatientFile || null,
          },
          aiGenerated: true,
          confidenceScore: clinicalNote.confidenceScore || null,
          suggestedEdits: [],
          status: 'PENDING',
        },
      });
    }

    console.log(`[Background] Processing completed for visit ${visitId}`);

    // Notify the doctor via WebSocket that processing is complete
    if (io) {
      const visit = await prisma.visit.findUnique({
        where: { id: visitId },
        include: { provider: true },
      });

      if (visit && visit.providerId) {
        io.sendToUser(visit.providerId, 'visit_processing_complete', {
          visitId,
          patientId,
          status: 'completed',
        });
        console.log(`[WebSocket] Notified doctor ${visit.providerId} about visit completion`);
      }
    }
  } catch (error: any) {
    console.error(`[Background] Error processing visit ${visitId}:`, error);

    // Update visit with error status
    await prisma.visit.update({
      where: { id: visitId },
      data: {
        processingStatus: 'failed',
        processingError: error.message || 'Processing failed',
      },
    });

    // Notify the doctor via WebSocket about the error
    if (io) {
      const visit = await prisma.visit.findUnique({
        where: { id: visitId },
        include: { provider: true },
      });

      if (visit && visit.providerId) {
        io.sendToUser(visit.providerId, 'visit_processing_failed', {
          visitId,
          patientId,
          status: 'failed',
          error: error.message || 'Processing failed',
        });
        console.log(`[WebSocket] Notified doctor ${visit.providerId} about visit failure`);
      }
    }
  }
};
