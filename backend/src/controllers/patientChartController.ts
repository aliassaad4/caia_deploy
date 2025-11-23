import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';

// Get or create patient chart
export const getOrCreatePatientChart = async (patientId: string) => {
  let chart = await prisma.patientChart.findUnique({
    where: { patientId },
  });

  if (!chart) {
    chart = await prisma.patientChart.create({
      data: {
        patientId,
      },
    });
  }

  return chart;
};

// Get patient chart (for patient view)
export const getPatientChart = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const chart = await getOrCreatePatientChart(req.user.id);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorType: 'patient',
        actorId: req.user.id,
        action: 'view',
        resourceType: 'patient_chart',
        resourceId: chart.id,
      },
    });

    res.json({
      status: 'success',
      data: chart,
    });
  } catch (error) {
    next(error);
  }
};

// Update patient chart (for doctor)
export const updatePatientChart = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { patientId, updates, visitId } = req.body;

    if (!patientId) {
      throw new AppError('Patient ID is required', 400);
    }

    // Ensure chart exists
    await getOrCreatePatientChart(patientId);

    // Update the chart
    const updatedChart = await prisma.patientChart.update({
      where: { patientId },
      data: {
        ...updates,
        lastUpdatedByVisit: visitId || updates.lastUpdatedByVisit,
        lastReviewedAt: new Date(),
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorType: 'doctor',
        actorId: req.user.id,
        action: 'update',
        resourceType: 'patient_chart',
        resourceId: updatedChart.id,
        changes: updates,
        rationale: visitId ? `Updated after visit ${visitId}` : 'Manual chart update',
      },
    });

    res.json({
      status: 'success',
      message: 'Patient chart updated successfully',
      data: updatedChart,
    });
  } catch (error) {
    next(error);
  }
};

// Get patient chart by patient ID (for doctor)
export const getPatientChartByDoctor = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { patientId } = req.params;

    if (!patientId) {
      throw new AppError('Patient ID is required', 400);
    }

    const chart = await getOrCreatePatientChart(patientId);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorType: 'doctor',
        actorId: req.user.id,
        action: 'view',
        resourceType: 'patient_chart',
        resourceId: chart.id,
      },
    });

    res.json({
      status: 'success',
      data: chart,
    });
  } catch (error) {
    next(error);
  }
};

// Append to chart sections (helper for incremental updates)
export const appendToChartSection = async (
  patientId: string,
  section: string,
  content: string
) => {
  const chart = await getOrCreatePatientChart(patientId);

  const currentContent = (chart as any)[section] || '';
  const timestamp = new Date().toLocaleString();
  const newContent = currentContent
    ? `${currentContent}\n\n[${timestamp}]\n${content}`
    : `[${timestamp}]\n${content}`;

  return await prisma.patientChart.update({
    where: { patientId },
    data: {
      [section]: newContent,
      lastReviewedAt: new Date(),
    },
  });
};

// Generate comprehensive patient file from all available data
export const generateComprehensivePatientFile = async (patientId: string): Promise<string> => {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      clinicalProfile: true,
      visits: {
        where: { status: 'COMPLETED', noteApproved: true },
        orderBy: { completedAt: 'desc' },
        take: 10,
      },
      messages: {
        where: { conversationId: { not: null } },
        orderBy: { createdAt: 'asc' },
        take: 50,
      },
    },
  });

  if (!patient) {
    return 'Patient not found';
  }

  let comprehensiveFile = '=== COMPREHENSIVE PATIENT FILE ===\n\n';

  // Patient demographics
  comprehensiveFile += `Patient Name: ${patient.firstName} ${patient.lastName}\n`;
  comprehensiveFile += `Date of Birth: ${patient.dateOfBirth?.toLocaleDateString() || 'Not specified'}\n`;
  comprehensiveFile += `Gender: ${patient.gender || 'Not specified'}\n\n`;

  // Initial consultation
  if (patient.initialConsultationReason) {
    comprehensiveFile += '--- INITIAL CONSULTATION ---\n';
    comprehensiveFile += `Date: ${patient.initialConsultationDate?.toLocaleString() || 'Unknown'}\n`;
    comprehensiveFile += `Chief Complaint: ${patient.initialConsultationReason}\n`;
    if (patient.initialConsultationNotes) {
      comprehensiveFile += `Initial Discussion:\n${patient.initialConsultationNotes}\n`;
    }
    comprehensiveFile += '\n';
  }

  // Clinical profile
  if (patient.clinicalProfile) {
    comprehensiveFile += '--- CLINICAL PROFILE ---\n';
    if (patient.clinicalProfile.bloodType) {
      comprehensiveFile += `Blood Type: ${patient.clinicalProfile.bloodType}\n`;
    }
    if (patient.clinicalProfile.allergies.length > 0) {
      comprehensiveFile += `Allergies: ${patient.clinicalProfile.allergies.join(', ')}\n`;
    }
    if (patient.clinicalProfile.chronicConditions.length > 0) {
      comprehensiveFile += `Chronic Conditions: ${patient.clinicalProfile.chronicConditions.join(', ')}\n`;
    }
    if (patient.clinicalProfile.currentMedications.length > 0) {
      comprehensiveFile += `Current Medications: ${patient.clinicalProfile.currentMedications.join(', ')}\n`;
    }
    if (patient.clinicalProfile.pastSurgeries.length > 0) {
      comprehensiveFile += `Past Surgeries: ${patient.clinicalProfile.pastSurgeries.join(', ')}\n`;
    }
    if (patient.clinicalProfile.familyHistory) {
      comprehensiveFile += `Family History: ${patient.clinicalProfile.familyHistory}\n`;
    }
    if (patient.clinicalProfile.smokingStatus) {
      comprehensiveFile += `Smoking Status: ${patient.clinicalProfile.smokingStatus}\n`;
    }
    if (patient.clinicalProfile.occupation) {
      comprehensiveFile += `Occupation: ${patient.clinicalProfile.occupation}\n`;
    }
    comprehensiveFile += '\n';
  }

  // Visit summaries (detailed, not summarized)
  if (patient.visits.length > 0) {
    comprehensiveFile += '--- VISIT HISTORY (Detailed) ---\n';
    patient.visits.forEach((visit, idx) => {
      comprehensiveFile += `\nVisit ${idx + 1}: ${visit.completedAt?.toLocaleDateString() || 'Unknown date'}\n`;
      comprehensiveFile += `Reason: ${visit.reasonForVisit}\n`;

      if (visit.hpiDraft) {
        comprehensiveFile += `\nHistory of Present Illness:\n${visit.hpiDraft}\n`;
      }

      if (visit.examFindings) {
        comprehensiveFile += `\nExamination Findings:\n${visit.examFindings}\n`;
      }

      if (visit.assessment) {
        comprehensiveFile += `\nAssessment:\n${visit.assessment}\n`;
      }

      if (visit.plan) {
        comprehensiveFile += `\nTreatment Plan:\n${visit.plan}\n`;
      }

      if (visit.patientInstructions) {
        comprehensiveFile += `\nInstructions Given to Patient:\n${visit.patientInstructions}\n`;
      }

      comprehensiveFile += '\n' + '-'.repeat(60) + '\n';
    });
  }

  return comprehensiveFile;
};

// Update patient file after visit completion
export const updatePatientFileAfterVisit = async (visitId: string) => {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
  });

  if (!visit) {
    throw new Error('Visit not found');
  }

  // Generate new comprehensive file
  const comprehensiveFile = await generateComprehensivePatientFile(visit.patientId);

  // Get or create patient chart
  const chart = await getOrCreatePatientChart(visit.patientId);

  // Update the chart with new comprehensive file
  await prisma.patientChart.update({
    where: { id: chart.id },
    data: {
      comprehensivePatientFile: comprehensiveFile,
      fileLastUpdatedFrom: `visit_${visitId}`,
      lastReviewedAt: new Date(),
    },
  });

  return chart;
};

// Add test results to patient chart
export const addTestResults = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { patientId, testType, testName, fileUrl, summary, uploadedBy } = req.body;

    if (!patientId || !testType || !testName) {
      throw new AppError('Missing required fields', 400);
    }

    // Get or create chart
    const chart = await getOrCreatePatientChart(patientId);

    // Get existing test results
    const existingResults = (chart.testResults as any[]) || [];

    // Add new test result
    const newTestResult = {
      type: testType,
      name: testName,
      date: new Date().toISOString(),
      fileUrl: fileUrl || null,
      summary: summary || null,
      uploadedBy: uploadedBy || req.user.id,
    };

    existingResults.push(newTestResult);

    // Update chart
    const updatedChart = await prisma.patientChart.update({
      where: { id: chart.id },
      data: {
        testResults: existingResults,
        lastReviewedAt: new Date(),
      },
    });

    // Regenerate comprehensive file
    const comprehensiveFile = await generateComprehensivePatientFile(patientId);
    await prisma.patientChart.update({
      where: { id: chart.id },
      data: {
        comprehensivePatientFile: comprehensiveFile,
        fileLastUpdatedFrom: 'test_results',
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorType: req.user.role === 'doctor' ? 'doctor' : 'patient',
        actorId: req.user.id,
        action: 'create',
        resourceType: 'test_result',
        resourceId: chart.id,
        metadata: { testType, testName },
        rationale: 'Test result added to patient chart',
      },
    });

    res.json({
      status: 'success',
      message: 'Test result added successfully',
      data: updatedChart,
    });
  } catch (error) {
    next(error);
  }
};
