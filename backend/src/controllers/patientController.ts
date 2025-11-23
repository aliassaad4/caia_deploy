import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configure multer for file uploads
const uploadsDir = path.join(__dirname, '../../uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPG, PNG, DOC, and DOCX files are allowed.'));
    }
  },
});

export const uploadMiddleware = upload.single('file');

export const getProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const patient = await prisma.patient.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        phone: true,
        address: true,
        city: true,
        country: true,
        timezone: true,
        preferredLanguage: true,
        emergencyContact: true,
        emergencyPhone: true,
        clinicalProfile: {
          select: {
            bloodType: true,
            allergies: true,
            chronicConditions: true,
            currentMedications: true,
            pastSurgeries: true,
            familyHistory: true,
          },
        },
        createdAt: true,
        updatedAt: true,
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

export const updateProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      phone,
      address,
      city,
      country,
      timezone,
      preferredLanguage,
      emergencyContact,
      emergencyPhone,
    } = req.body;

    const patient = await prisma.patient.update({
      where: { id: req.user.id },
      data: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(dateOfBirth && { dateOfBirth: new Date(dateOfBirth) }),
        ...(gender && { gender }),
        ...(phone && { phone }),
        ...(address && { address }),
        ...(city && { city }),
        ...(country && { country }),
        ...(timezone && { timezone }),
        ...(preferredLanguage && { preferredLanguage }),
        ...(emergencyContact && { emergencyContact }),
        ...(emergencyPhone && { emergencyPhone }),
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorType: 'patient',
        actorId: req.user.id,
        action: 'update',
        resourceType: 'patient',
        resourceId: patient.id,
        changes: req.body,
      },
    });

    res.json({
      status: 'success',
      data: patient,
    });
  } catch (error) {
    next(error);
  }
};

export const getRecords = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    // Get patient basic info
    const patient = await prisma.patient.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        phone: true,
        email: true,
        address: true,
        city: true,
        country: true,
        emergencyContact: true,
        emergencyPhone: true,
        createdAt: true,
      },
    });

    // Get detailed clinical profile
    const clinicalProfile = await prisma.clinicalProfile.findUnique({
      where: { patientId: req.user.id },
    });

    // Get ALL visit records (both approved and pending) with full details
    const visits = await prisma.visit.findMany({
      where: {
        patientId: req.user.id,
        noteApproved: true, // Only show approved notes
      },
      select: {
        id: true,
        scheduledAt: true,
        completedAt: true,
        status: true,
        visitType: true,
        reasonForVisit: true,
        chiefComplaint: true,
        hpiDraft: true,
        assessment: true,
        plan: true,
        patientSummary: true,
        patientInstructions: true,
        durationMinutes: true,
        priorityScore: true,
      },
      orderBy: {
        scheduledAt: 'desc',
      },
    });

    // Get ALL tasks (completed and pending)
    const allTasks = await prisma.task.findMany({
      where: {
        patientId: req.user.id,
      },
      orderBy: [
        { status: 'asc' }, // PENDING first
        { createdAt: 'desc' },
      ],
    });

    // Get uploaded files (lab results, imaging, etc.)
    const uploadedFiles = await prisma.patientFile.findMany({
      where: {
        patientId: req.user.id,
        deletedAt: null,
      },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        fileCategory: true,
        description: true,
        createdAt: true,
        visitId: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Note: Prescriptions can be added later if medication tracking is implemented

    // Build comprehensive medical summary
    const medicalSummary = {
      // Patient Demographics
      demographics: {
        fullName: `${patient?.firstName} ${patient?.lastName}`,
        dateOfBirth: patient?.dateOfBirth,
        age: patient?.dateOfBirth
          ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
          : null,
        gender: patient?.gender,
        contact: {
          phone: patient?.phone,
          email: patient?.email,
          address: `${patient?.address}, ${patient?.city}, ${patient?.country}`,
        },
        emergencyContact: {
          name: patient?.emergencyContact,
          phone: patient?.emergencyPhone,
        },
        registeredSince: patient?.createdAt,
      },

      // Clinical Information
      clinicalInfo: {
        bloodType: clinicalProfile?.bloodType,
        allergies: clinicalProfile?.allergies || [],
        chronicConditions: clinicalProfile?.chronicConditions || [],
        currentMedications: clinicalProfile?.currentMedications || [],
        pastSurgeries: clinicalProfile?.pastSurgeries || [],
        familyHistory: clinicalProfile?.familyHistory || null,
        socialHistory: {
          smokingStatus: clinicalProfile?.smokingStatus,
          alcoholUse: clinicalProfile?.alcoholUse,
        },
      },

      // Visit History
      visitHistory: visits,

      // Tasks & Follow-ups
      tasks: {
        pending: allTasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS'),
        completed: allTasks.filter((t) => t.status === 'COMPLETED'),
      },

      // Uploaded Documents
      documents: uploadedFiles,

      // Statistics
      statistics: {
        totalVisits: visits.length,
        completedTasks: allTasks.filter((t) => t.status === 'COMPLETED').length,
        pendingTasks: allTasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length,
        uploadedDocuments: uploadedFiles.length,
      },
    };

    // Create audit log for record access
    await prisma.auditLog.create({
      data: {
        actorType: 'patient',
        actorId: req.user.id,
        action: 'view',
        resourceType: 'patient_records',
        resourceId: req.user.id,
      },
    });

    res.json({
      status: 'success',
      data: medicalSummary,
    });
  } catch (error) {
    next(error);
  }
};

export const getLastVisit = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const lastVisit = await prisma.visit.findFirst({
      where: {
        patientId: req.user.id,
        status: 'COMPLETED',
        noteApproved: true,
      },
      orderBy: {
        completedAt: 'desc',
      },
      select: {
        scheduledAt: true,
        completedAt: true,
        reasonForVisit: true,
        patientSummary: true,
      },
    });

    res.json({
      status: 'success',
      data: lastVisit,
    });
  } catch (error) {
    next(error);
  }
};

export const getOpenTasks = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const tasks = await prisma.task.findMany({
      where: {
        patientId: req.user.id,
        status: {
          in: ['PENDING', 'IN_PROGRESS'],
        },
        // Only show tasks that doctor has approved
        OR: [
          { requiresApproval: false },
          { approvedAt: { not: null } },
        ],
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
      ],
    });

    res.json({
      status: 'success',
      data: tasks,
    });
  } catch (error) {
    next(error);
  }
};

export const uploadFile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    const { category = 'lab_result' } = req.body;

    // Determine file category
    let fileCategory: 'LAB_RESULT' | 'IMAGING' | 'PRESCRIPTION' | 'INSURANCE' | 'ID_DOCUMENT' | 'OTHER' = 'LAB_RESULT';
    if (category === 'imaging' || category === 'mri' || category === 'xray') {
      fileCategory = 'IMAGING';
    } else if (category === 'prescription') {
      fileCategory = 'PRESCRIPTION';
    } else if (category === 'insurance') {
      fileCategory = 'INSURANCE';
    } else if (category === 'id' || category === 'identification') {
      fileCategory = 'ID_DOCUMENT';
    } else if (category !== 'lab_result' && category !== 'test_result') {
      fileCategory = 'OTHER';
    }

    // Create file record in database
    const file = await prisma.patientFile.create({
      data: {
        patientId: req.user.id,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        fileCategory: fileCategory,
        storageUrl: req.file.path, // Local path for now
        storageKey: req.file.filename,
        uploadedBy: req.user.id,
        description: `Uploaded via chat - ${fileCategory}`,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorType: 'patient',
        actorId: req.user.id,
        action: 'upload',
        resourceType: 'file',
        resourceId: file.id,
        changes: {
          fileName: file.fileName,
          fileCategory: file.fileCategory,
          fileSize: file.fileSize,
        },
      },
    });

    res.json({
      status: 'success',
      message: 'File uploaded successfully',
      data: {
        id: file.id,
        fileName: file.fileName,
        fileType: file.fileType,
        fileSize: file.fileSize,
        fileCategory: file.fileCategory,
        createdAt: file.createdAt,
      },
    });
  } catch (error) {
    // Clean up uploaded file if database operation fails
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
};

// Get patient's pending tasks (orders from doctor)
export const getPatientTasks = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const patientId = req.user?.id;

    if (!patientId) {
      throw new AppError('Unauthorized', 401);
    }

    // Fetch tasks that are approved (doctor has approved them) and not completed
    const tasks = await prisma.task.findMany({
      where: {
        patientId,
        status: {
          in: ['PENDING', 'IN_PROGRESS'],
        },
        // Only show tasks that doctor has approved OR tasks that don't require approval
        OR: [
          { requiresApproval: false },
          { approvedAt: { not: null } },
        ],
      },
      orderBy: [
        { priority: 'desc' }, // URGENT, HIGH, MEDIUM, LOW
        { createdAt: 'desc' },
      ],
    });

    res.json({
      status: 'success',
      data: tasks,
    });
  } catch (error) {
    next(error);
  }
};
