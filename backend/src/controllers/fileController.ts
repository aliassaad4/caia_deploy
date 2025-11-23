import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { uploadToSupabase, downloadFromSupabase } from '../services/storageService';
import FileService from '../services/fileService';
import * as fs from 'fs';
import * as path from 'path';

export const uploadFile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    console.log('=== uploadFile START ===');
    console.log('User ID:', req.user?.id);

    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    console.log('📄 File received:', req.file.originalname, 'Size:', req.file.size);

    const { fileCategory, description, visitId, messageId } = req.body;
    console.log('Category:', fileCategory);
    const io = req.app.get('io');

    if (!fileCategory) {
      throw new AppError('File category required', 400);
    }

    // Upload to Supabase storage
    console.log('⬆️ Uploading to Supabase...');
    const { storageUrl, storageKey } = await uploadToSupabase(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      req.user.id
    );
    console.log('✅ Supabase upload success');

    // Save file record
    console.log('💾 Creating file record in DB...');
    const patientFile = await prisma.patientFile.create({
      data: {
        patientId: req.user.id,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        fileCategory,
        storageUrl,
        storageKey,
        description,
        uploadedBy: req.user.id,
        visitId,
        messageId,
      },
    });
    console.log('✅ File record created:', patientFile.id);

    // Feature 1: Notify doctor in real-time
    let notificationSent = false;
    console.log('📢 Checking io for notifications, io exists:', !!io);
    if (io) {
      try {
        console.log('📢 Calling FileService.notifyDoctorOfFileUpload...');
        await FileService.notifyDoctorOfFileUpload(patientFile.id, req.user.id, io);
        notificationSent = true;
        console.log('✅ Notification sent successfully');
      } catch (notificationError) {
        console.error('❌ Warning: Failed to notify doctor:', notificationError);
      }
    } else {
      console.error('❌ No io instance found, cannot send notifications');
    }

    // Feature 2: Create file review task
    let taskCreated = false;
    let taskId: string | null = null;
    try {
      const task = await FileService.createFileReviewTask(patientFile.id);
      taskCreated = !!task;
      taskId = task?.id || null;
    } catch (taskError) {
      console.error('Warning: Failed to create task:', taskError);
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorType: 'patient',
        actorId: req.user.id,
        action: 'file:upload',
        resourceType: 'PatientFile',
        resourceId: patientFile.id,
        metadata: {
          fileName: req.file.originalname,
          fileCategory,
          notificationSent,
          taskCreated,
        },
      },
    });

    res.status(201).json({
      status: 'success',
      message: 'File uploaded successfully',
      file: {
        id: patientFile.id,
        fileName: patientFile.fileName,
        fileType: patientFile.fileType,
        fileSize: patientFile.fileSize,
        fileCategory: patientFile.fileCategory,
        versionNumber: patientFile.versionNumber,
        createdAt: patientFile.createdAt,
      },
      notificationSent,
      taskCreated,
      taskId,
    });
  } catch (error) {
    next(error);
  }
};

export const downloadFile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id: fileId } = req.params;

    // Get file record
    const patientFile = await prisma.patientFile.findFirst({
      where: {
        id: fileId,
        deletedAt: null,
      },
    });

    if (!patientFile) {
      throw new AppError('File not found', 404);
    }

    // Authorization: Allow if user is the patient OR doctor with notification for this file
    const isPatient = patientFile.patientId === req.user.id;

    let isAuthorizedDoctor = false;
    if (req.user.role === 'doctor') {
      // Check if doctor has a notification for this file
      const notification = await prisma.fileNotification.findFirst({
        where: {
          fileId: patientFile.id,
          doctorId: req.user.id,
        },
      });
      isAuthorizedDoctor = !!notification;
    }

    if (!isPatient && !isAuthorizedDoctor) {
      throw new AppError('Not authorized to access this file', 403);
    }

    // Download file from storage (Supabase or local)
    let fileData: Buffer;

    // Debug logging
    console.log('📁 File download info:', {
      storageUrl: patientFile.storageUrl,
      storageKey: patientFile.storageKey,
      isLocal: patientFile.storageUrl.startsWith('/api/files/')
    });


    // Check if file is stored locally (storageUrl starts with /api/files/)
    if (patientFile.storageUrl.startsWith('/api/files/')) {
      // File is in local storage
      console.log('✅ Using LOCAL storage for file download');
      const { downloadFromLocalStorage } = require('../services/storageService');
      fileData = await downloadFromLocalStorage(patientFile.storageKey);
    } else {
      // File is in Supabase cloud storage
      console.log('☁️ Using SUPABASE storage for file download');
      fileData = await downloadFromSupabase(patientFile.storageKey);
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorType: req.user.role === 'doctor' ? 'doctor' : 'patient',
        actorId: req.user.id,
        action: 'file:download',
        resourceType: 'PatientFile',
        resourceId: patientFile.id,
        metadata: {
          fileName: patientFile.fileName,
          patientId: patientFile.patientId,
        },
      },
    });

    // Set headers and send file
    res.setHeader('Content-Type', patientFile.fileType);
    res.setHeader('Content-Disposition', `attachment; filename="${patientFile.fileName}"`);
    res.send(fileData);
  } catch (error) {
    next(error);
  }
};

export const getFiles = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { category, visitId } = req.query;

    const files = await prisma.patientFile.findMany({
      where: {
        patientId: req.user.id,
        deletedAt: null,
        ...(category && { fileCategory: category as any }),
        ...(visitId && { visitId: visitId as string }),
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        fileCategory: true,
        description: true,
        createdAt: true,
        reviewStatus: true,
        aiSummary: true,
      },
    });

    res.json({
      status: 'success',
      data: files,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get File Preview (Feature 3)
 * GET /api/patients/files/:fileId/preview?format=thumbnail|full
 */
export const getFilePreview = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { fileId } = req.params;
    const { format = 'thumbnail' } = req.query as Record<string, string>;

    // Verify file access
    const file = await prisma.patientFile.findFirst({
      where: {
        id: fileId,
        deletedAt: null
      },
    });

    if (!file) {
      throw new AppError('File not found', 404);
    }

    // Authorization: Allow if user is the patient OR doctor with notification for this file
    const isPatient = file.patientId === req.user.id;

    let isAuthorizedDoctor = false;
    if (req.user.role === 'doctor') {
      // Check if doctor has a notification for this file
      const notification = await prisma.fileNotification.findFirst({
        where: {
          fileId: file.id,
          doctorId: req.user.id,
        },
      });
      isAuthorizedDoctor = !!notification;
    }

    if (!isPatient && !isAuthorizedDoctor) {
      throw new AppError('Not authorized to access this file', 403);
    }

    // For images, the frontend will use the download endpoint to display
    // For other files, no preview is available
    res.json({
      status: 'success',
      data: {
        fileId: file.id,
        fileName: file.fileName,
        fileType: file.fileType,
        supportsPreview: file.fileType?.startsWith('image/'),
        previewUrl: null, // Frontend will use download endpoint for images
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add Annotation to File (Feature 4)
 * POST /api/doctor/files/:fileId/annotate
 */
export const annotateFile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { fileId } = req.params;
    const { annotationType, content, pageNumber, coordinates } = req.body;
    const io = req.app.get('io');

    if (!annotationType || !content) {
      throw new AppError('Missing required fields: annotationType, content', 400);
    }

    if (!['highlight', 'note', 'flag', 'correction'].includes(annotationType)) {
      throw new AppError('Invalid annotationType', 400);
    }

    // Verify file exists
    const file = await prisma.patientFile.findUnique({
      where: { id: fileId }
    });

    if (!file) {
      throw new AppError('File not found', 404);
    }

    // Add annotation
    const annotation = await FileService.addAnnotation(
      fileId,
      req.user.id,
      {
        annotationType,
        content,
        pageNumber,
        coordinates,
      },
      io
    );

    res.status(201).json({
      status: 'success',
      message: 'Annotation added successfully',
      data: annotation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add Comment to File (Feature 4.5)
 * POST /api/doctor/files/:fileId/comment
 */
export const addFileComment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { fileId } = req.params;
    const { content } = req.body;
    const io = req.app.get('io');

    if (!content) {
      throw new AppError('Missing required field: content', 400);
    }

    // Verify file exists
    const file = await prisma.patientFile.findUnique({
      where: { id: fileId }
    });

    if (!file) {
      throw new AppError('File not found', 404);
    }

    // Add comment
    const comment = await FileService.addComment(
      fileId,
      req.user.id,
      content,
      io
    );

    res.status(201).json({
      status: 'success',
      message: 'Comment added successfully',
      data: comment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get File Versions (Feature 5)
 * GET /api/patients/files/:fileId/versions
 */
export const getFileVersions = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { fileId } = req.params;

    // Verify file access
    const file = await prisma.patientFile.findUnique({
      where: { id: fileId }
    });

    if (!file) {
      throw new AppError('File not found', 404);
    }

    if (file.patientId !== req.user.id) {
      throw new AppError('Unauthorized to access this file', 403);
    }

    // Get versions
    const versionData = await FileService.getFileVersions(fileId);

    res.json({
      status: 'success',
      data: versionData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get File with Details (Annotations, Comments)
 * GET /api/patients/files/:fileId/details
 */
export const getFileWithDetails = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { fileId } = req.params;

    // Get file with all details
    const file = await FileService.getFileWithDetails(fileId);

    if (!file) {
      throw new AppError('File not found', 404);
    }

    // Authorization: Allow if user is the patient OR doctor with notification for this file
    const isPatient = file.patientId === req.user.id;

    let isAuthorizedDoctor = false;
    if (req.user.role === 'doctor') {
      // Check if doctor has a notification for this file
      const notification = await prisma.fileNotification.findFirst({
        where: {
          fileId: file.id,
          doctorId: req.user.id,
        },
      });
      isAuthorizedDoctor = !!notification;
    }

    if (!isPatient && !isAuthorizedDoctor) {
      throw new AppError('Not authorized to access this file', 403);
    }

    res.json({
      status: 'success',
      data: file,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Doctor File Notifications
 * GET /api/doctor/files/notifications?status=PENDING|READ|ARCHIVED
 */
export const getFileNotifications = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    console.log('📋 getFileNotifications CALLED');
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }
    console.log('📋 Doctor ID:', req.user.id);

    const { status, limit = '10', offset = '0' } = req.query as Record<string, string>;
    console.log('📋 Query params:', { status, limit, offset });

    // Build where clause - only filter by status if explicitly provided and not 'ALL'
    const whereClause: any = {
      doctorId: req.user.id,
    };

    if (status && status !== 'ALL') {
      whereClause.status = status;
    }

    const notifications = await prisma.fileNotification.findMany({
      where: {
        ...whereClause,
        file: {
          deletedAt: null, // Only include notifications for non-deleted files
        },
      },
      include: {
        file: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            fileCategory: true,
            fileSize: true,
            createdAt: true
          }
        },
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
    });

    console.log('📋 Found notifications:', notifications.length);

    const total = await prisma.fileNotification.count({
      where: {
        ...whereClause,
        file: {
          deletedAt: null, // Only count notifications for non-deleted files
        },
      },
    });

    const unreadCount = await prisma.fileNotification.count({
      where: {
        doctorId: req.user.id,
        status: 'PENDING',
        readAt: null,
        file: {
          deletedAt: null, // Only count notifications for non-deleted files
        },
      }
    });

    res.json({
      status: 'success',
      data: notifications,
      pagination: {
        total,
        unreadCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark Notification as Read
 * PUT /api/doctor/files/notifications/:notificationId/read
 */
export const markNotificationAsRead = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { notificationId } = req.params;

    // Verify notification belongs to doctor
    const notification = await prisma.fileNotification.findUnique({
      where: { id: notificationId }
    });

    if (!notification) {
      throw new AppError('Notification not found', 404);
    }

    if (notification.doctorId !== req.user.id) {
      throw new AppError('Unauthorized to access this notification', 403);
    }

    // Update notification status
    const updated = await prisma.fileNotification.update({
      where: { id: notificationId },
      data: {
        status: 'READ',
        readAt: new Date()
      }
    });

    res.json({
      status: 'success',
      message: 'Notification marked as read',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Archive Notification
 * PUT /api/doctor/files/notifications/:notificationId/archive
 */
export const archiveNotification = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { notificationId } = req.params;

    // Verify notification belongs to doctor
    const notification = await prisma.fileNotification.findUnique({
      where: { id: notificationId }
    });

    if (!notification) {
      throw new AppError('Notification not found', 404);
    }

    if (notification.doctorId !== req.user.id) {
      throw new AppError('Unauthorized to access this notification', 403);
    }

    // Update notification status
    const updated = await prisma.fileNotification.update({
      where: { id: notificationId },
      data: {
        status: 'ARCHIVED'
      }
    });

    res.json({
      status: 'success',
      message: 'Notification archived',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// Serve local uploaded files (for local storage fallback)
export const serveLocalFile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { patientId, filename } = req.params;

    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    // Construct file path
    const uploadsDir = path.join(__dirname, '../../uploads');
    const filePath = path.join(uploadsDir, patientId, filename);

    // Security: Prevent directory traversal attacks
    const realPath = path.resolve(filePath);
    const realUploadsDir = path.resolve(uploadsDir);
    if (!realPath.startsWith(realUploadsDir)) {
      throw new AppError('Invalid file path', 400);
    }

    // Check if file exists
    if (!fs.existsSync(realPath)) {
      throw new AppError('File not found', 404);
    }

    // Get file stats
    const stats = fs.statSync(realPath);
    if (!stats.isFile()) {
      throw new AppError('Invalid file', 400);
    }

    // Read and send file
    const fileBuffer = fs.readFileSync(realPath);
    const mimeType = getMimeType(realPath);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', stats.size);
    res.send(fileBuffer);

    console.log(`📥 Served local file: ${filename}`);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete Patient File
 * DELETE /api/patients/files/:fileId
 * Allows patient to delete their own uploaded files
 */
export const deleteFile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { fileId } = req.params;

    // Get file and verify ownership
    const patientFile = await prisma.patientFile.findFirst({
      where: {
        id: fileId,
        patientId: req.user.id, // Ensure user is the owner
        deletedAt: null,
      }
    });

    if (!patientFile) {
      throw new AppError('File not found or you do not have permission to delete it', 404);
    }

    // Soft delete: just mark as deleted
    const deletedFile = await prisma.patientFile.update({
      where: { id: fileId },
      data: {
        deletedAt: new Date()
      }
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        actorType: 'patient',
        actorId: req.user.id,
        action: 'file:delete',
        resourceType: 'PatientFile',
        resourceId: fileId,
        metadata: {
          fileName: patientFile.fileName,
          fileSize: patientFile.fileSize,
        },
      },
    });

    console.log(`🗑️ File deleted: ${fileId} by patient ${req.user.id}`);

    res.json({
      status: 'success',
      message: 'File deleted successfully',
      data: {
        id: deletedFile.id,
        fileName: deletedFile.fileName,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Helper function to determine MIME type
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: { [key: string]: string } = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

