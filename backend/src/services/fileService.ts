import { prisma } from '../index';
import { Server } from 'socket.io';
import { PatientFile, FileAnnotation, FileComment } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

/**
 * FileService: Handles all file-related operations including:
 * 1. Real-time notifications to doctors
 * 2. Task creation for file reviews
 * 3. File preview generation
 * 4. Annotations and comments
 * 5. File versioning
 */

export class FileService {
  /**
   * Feature 1: Notify Doctor of File Upload
   * Creates notification record and emits real-time WebSocket event
   * If no specific doctor is found, broadcasts to all doctors
   */
  static async notifyDoctorOfFileUpload(
    fileId: string,
    patientId: string,
    io: Server
  ): Promise<void> {
    try {
      console.log(`📢 Starting notification process for file ${fileId}, patient ${patientId}`);

      const file = await prisma.patientFile.findUnique({
        where: { id: fileId },
        include: { patient: true }
      });

      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }

      // Get patient's doctor (from upcoming or recent visits)
      console.log(`🔍 Looking for doctor for patient ${patientId}...`);
      let doctor = await this.getDoctorForPatient(patientId);

      // If no doctor found, broadcast to all doctors
      if (!doctor) {
        console.warn(`⚠️ No doctor found for patient ${patientId}, broadcasting to all doctors`);

        // Get all doctors
        const allDoctors = await prisma.provider.findMany();

        if (allDoctors.length === 0) {
          console.error(`❌ No doctors exist in the system, cannot create notification`);
          return;
        }

        console.log(`📢 Broadcasting file notification to ${allDoctors.length} doctors`);

        // Create notification for each doctor
        for (const doc of allDoctors) {
          try {
            await prisma.fileNotification.create({
              data: {
                fileId,
                patientId,
                doctorId: doc.id,
                status: 'PENDING'
              }
            });

            // Emit WebSocket event
            io.to(`doctor:${doc.id}:files`).emit('file:uploaded', {
              fileId,
              patientName: file.patient.firstName + ' ' + file.patient.lastName,
              fileName: file.fileName,
              fileCategory: file.fileCategory,
              fileSize: file.fileSize,
              uploadedAt: file.createdAt,
              patientId,
              unassignedFile: true
            });
          } catch (err) {
            console.error(`Failed to create notification for doctor ${doc.id}:`, err);
          }
        }

        // Log audit event
        await this.logAuditEvent({
          actorType: 'system',
          action: 'file:upload:notification:broadcast',
          resourceType: 'PatientFile',
          resourceId: fileId,
          rationale: `File broadcasted to all ${allDoctors.length} doctors (no visit relationship found)`
        });

        console.log(`✅ File notification broadcasted to all doctors`);
        return;
      }

      console.log(`✅ Found doctor ${doctor.id} (${doctor.firstName} ${doctor.lastName})`);

      // Create notification record in database for specific doctor
      console.log(`💾 Creating notification record...`);
      const notification = await prisma.fileNotification.create({
        data: {
          fileId,
          patientId,
          doctorId: doctor.id,
          status: 'PENDING'
        },
        include: {
          file: true,
          patient: true,
          doctor: true
        }
      });

      console.log(`✅ Notification record created: ${notification.id}`);

      // Emit real-time WebSocket event to doctor
      console.log(`📡 Emitting WebSocket event to doctor:${doctor.id}:files`);
      io.to(`doctor:${doctor.id}:files`).emit('file:uploaded', {
        notificationId: notification.id,
        fileId,
        patientName: file.patient.firstName + ' ' + file.patient.lastName,
        fileName: file.fileName,
        fileCategory: file.fileCategory,
        fileSize: file.fileSize,
        uploadedAt: file.createdAt,
        patientId
      });

      // Log audit event
      await this.logAuditEvent({
        actorType: 'system',
        action: 'file:upload:notification',
        resourceType: 'PatientFile',
        resourceId: fileId,
        rationale: `Doctor ${doctor.id} notified of file upload: ${file.fileName}`
      });

      console.log(`✅ Notification sent to doctor ${doctor.id} for file ${fileId}`);
    } catch (error) {
      console.error('❌ Error in notifyDoctorOfFileUpload:', error);
      throw error;
    }
  }

  /**
   * Feature 2: Create File Review Task
   * Automatically creates a task for doctor to review uploaded file
   */
  static async createFileReviewTask(fileId: string): Promise<any> {
    try {
      const file = await prisma.patientFile.findUnique({
        where: { id: fileId },
        include: { patient: true }
      });

      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }

      // Get patient's doctor
      const doctor = await this.getDoctorForPatient(file.patientId);

      if (!doctor) {
        console.warn(`No doctor found for patient ${file.patientId}, skipping task creation`);
        return null;
      }

      // Create task
      const task = await prisma.task.create({
        data: {
          title: `Review patient file: ${file.fileName}`,
          description: `${file.fileCategory} - ${file.description || 'No description provided'}`,
          taskType: 'FILE_REVIEW',
          priority: 'MEDIUM',
          status: 'PENDING',
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Due tomorrow
          patientId: file.patientId,
          visitId: file.visitId || undefined,
          orderDetails: {
            fileId: fileId,
            fileName: file.fileName,
            fileCategory: file.fileCategory,
            uploadedBy: file.uploadedBy,
            uploadedAt: file.createdAt
          } as any
        }
      });

      // Log audit event
      await this.logAuditEvent({
        actorType: 'system',
        action: 'task:create:file_review',
        resourceType: 'Task',
        resourceId: task.id,
        rationale: `Automatic task created for file review: ${file.fileName}`
      });

      console.log(`Task created for file review: ${task.id}`);
      return task;
    } catch (error) {
      console.error('Error in createFileReviewTask:', error);
      throw error;
    }
  }

  /**
   * Feature 3: Generate File Preview
   * Creates thumbnail or full preview for images and PDFs
   */
  static async generateFilePreview(
    fileId: string,
    format: 'thumbnail' | 'full' = 'thumbnail'
  ): Promise<any> {
    try {
      const file = await prisma.patientFile.findUnique({
        where: { id: fileId }
      });

      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }

      // Download file from storage
      const filePath = await this.downloadFileFromStorage(file.storageUrl, file.storageKey);

      let previewData: any = {
        fileId,
        mimeType: file.fileType,
        fileName: file.fileName
      };

      // Generate preview based on file type
      if (file.fileType === 'image' || file.fileType.startsWith('image/')) {
        previewData = await this.generateImagePreview(filePath, format, previewData);
      } else if (file.fileType === 'pdf' || file.fileType === 'application/pdf') {
        previewData = await this.generatePdfPreview(filePath, format, previewData);
      } else {
        // For unsupported types, return placeholder
        previewData.previewUrl = null;
        previewData.supportsPreview = false;
      }

      // Clean up temporary file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      return previewData;
    } catch (error) {
      console.error('Error generating file preview:', error);
      throw error;
    }
  }

  /**
   * Feature 4: Add Annotation to File
   * Doctor can highlight, add notes, flag issues on files
   */
  static async addAnnotation(
    fileId: string,
    doctorId: string,
    data: {
      annotationType: string;
      content: string;
      pageNumber?: number;
      coordinates?: any;
    },
    io: Server
  ): Promise<FileAnnotation> {
    try {
      // Create annotation
      const annotation = await prisma.fileAnnotation.create({
        data: {
          fileId,
          doctorId,
          annotationType: data.annotationType,
          content: data.content,
          pageNumber: data.pageNumber,
          coordinates: data.coordinates
        },
        include: {
          doctor: true,
          file: { include: { patient: true } }
        }
      });

      // Emit notification to patient
      const file = annotation.file;
      io.to(`patient:${file.patientId}:files`).emit('file:annotation:added', {
        fileId,
        annotationId: annotation.id,
        doctorName: annotation.doctor.firstName + ' ' + annotation.doctor.lastName,
        annotationType: annotation.annotationType,
        createdAt: annotation.createdAt
      });

      // Log audit event
      await this.logAuditEvent({
        actorType: 'doctor',
        actorId: doctorId,
        action: 'annotation:create',
        resourceType: 'FileAnnotation',
        resourceId: annotation.id,
        rationale: `Added ${data.annotationType} annotation to file`
      });

      console.log(`Annotation created: ${annotation.id}`);
      return annotation;
    } catch (error) {
      console.error('Error adding annotation:', error);
      throw error;
    }
  }

  /**
   * Feature 4.5: Add Comment to File
   * Doctor can add comments visible to patient
   */
  static async addComment(
    fileId: string,
    doctorId: string,
    content: string,
    io: Server
  ): Promise<FileComment> {
    try {
      // Create comment
      const comment = await prisma.fileComment.create({
        data: {
          fileId,
          doctorId,
          content
        },
        include: {
          doctor: true,
          file: { include: { patient: true } }
        }
      });

      // Emit notification to patient
      const file = comment.file;
      io.to(`patient:${file.patientId}:files`).emit('file:comment:added', {
        fileId,
        commentId: comment.id,
        doctorName: comment.doctor.firstName + ' ' + comment.doctor.lastName,
        content: content,
        createdAt: comment.createdAt
      });

      // Log audit event
      await this.logAuditEvent({
        actorType: 'doctor',
        actorId: doctorId,
        action: 'comment:create',
        resourceType: 'FileComment',
        resourceId: comment.id,
        rationale: `Added comment to file`
      });

      console.log(`Comment created: ${comment.id}`);
      return comment;
    } catch (error) {
      console.error('Error adding comment:', error);
      throw error;
    }
  }

  /**
   * Feature 5: Upload New File Version
   * Track file revisions with versioning
   */
  static async uploadNewVersion(
    originalFileId: string,
    newFile: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
    patientId: string,
    storageUrl: string,
    storageKey: string
  ): Promise<PatientFile> {
    try {
      const originalFile = await prisma.patientFile.findUnique({
        where: { id: originalFileId }
      });

      if (!originalFile) {
        throw new Error(`Original file not found: ${originalFileId}`);
      }

      // Verify patient ownership
      if (originalFile.patientId !== patientId) {
        throw new Error('Unauthorized: File does not belong to this patient');
      }

      // Create new version
      const newVersion = await prisma.patientFile.create({
        data: {
          patientId,
          fileName: newFile.originalname,
          fileType: this.getFileType(newFile.mimetype),
          fileSize: newFile.size,
          fileCategory: originalFile.fileCategory,
          storageUrl,
          storageKey,
          uploadedBy: patientId,
          parentFileId: originalFileId,
          versionNumber: originalFile.versionNumber + 1,
          description: `Version ${originalFile.versionNumber + 1} of ${originalFile.fileName}`,
          visitId: originalFile.visitId,
          messageId: originalFile.messageId,
          encrypted: originalFile.encrypted
        }
      });

      // Log audit event
      await this.logAuditEvent({
        actorType: 'patient',
        actorId: patientId,
        action: 'file:upload:version',
        resourceType: 'PatientFile',
        resourceId: newVersion.id,
        rationale: `New version uploaded for file: ${originalFile.fileName}`
      });

      console.log(`New version created: ${newVersion.id} (v${newVersion.versionNumber})`);
      return newVersion;
    } catch (error) {
      console.error('Error uploading new version:', error);
      throw error;
    }
  }

  /**
   * Get File Versions and Change Log
   */
  static async getFileVersions(fileId: string): Promise<any> {
    try {
      const currentFile = await prisma.patientFile.findUnique({
        where: { id: fileId }
      });

      if (!currentFile) {
        throw new Error(`File not found: ${fileId}`);
      }

      // Get all versions (this file if it's a version, plus all its versions)
      let allVersions: PatientFile[] = [];
      const parentId = currentFile.parentFileId || fileId;

      // If this is a version, get the original file
      const originalFile = currentFile.parentFileId
        ? await prisma.patientFile.findUnique({ where: { id: currentFile.parentFileId } })
        : currentFile;

      // Get all versions of this file
      allVersions = await prisma.patientFile.findMany({
        where: {
          OR: [
            { id: parentId },
            { parentFileId: parentId }
          ]
        },
        orderBy: { versionNumber: 'desc' }
      });

      return {
        current: currentFile,
        originalFile: originalFile,
        versions: allVersions,
        changeLog: allVersions.map(v => ({
          versionNumber: v.versionNumber,
          uploadedAt: v.createdAt,
          fileName: v.fileName,
          fileSize: v.fileSize,
          uploadedBy: v.uploadedBy
        }))
      };
    } catch (error) {
      console.error('Error getting file versions:', error);
      throw error;
    }
  }

  /**
   * Get File with Annotations and Comments
   */
  static async getFileWithDetails(fileId: string): Promise<any> {
    try {
      const file = await prisma.patientFile.findUnique({
        where: { id: fileId },
        include: {
          annotations: {
            include: { doctor: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: { createdAt: 'desc' }
          },
          comments: {
            include: { doctor: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: { createdAt: 'desc' }
          },
          notifications: {
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      return file;
    } catch (error) {
      console.error('Error getting file with details:', error);
      throw error;
    }
  }

  /**
   * Helper: Get Doctor for Patient
   * Uses smart doctor selection logic with multiple fallbacks
   */
  private static async getDoctorForPatient(patientId: string): Promise<any> {
    try {
      // Try to get doctor from upcoming scheduled visit
      const upcomingVisit = await prisma.visit.findFirst({
        where: {
          patientId,
          status: 'SCHEDULED',
          scheduledAt: { gte: new Date() }
        },
        select: { providerId: true },
        orderBy: { scheduledAt: 'asc' }
      });

      if (upcomingVisit?.providerId) {
        const doctor = await prisma.provider.findUnique({
          where: { id: upcomingVisit.providerId }
        });
        if (doctor) {
          console.log(`✅ Found doctor ${doctor.id} from upcoming visit`);
          return doctor;
        }
      }

      // Fall back to doctor from most recent completed visit
      const recentVisit = await prisma.visit.findFirst({
        where: {
          patientId,
          status: 'COMPLETED'
        },
        select: { providerId: true },
        orderBy: { completedAt: 'desc' }
      });

      if (recentVisit?.providerId) {
        const doctor = await prisma.provider.findUnique({
          where: { id: recentVisit.providerId }
        });
        if (doctor) {
          console.log(`✅ Found doctor ${doctor.id} from recent completed visit`);
          return doctor;
        }
      }

      // Fall back to any provider (should not happen in normal flow)
      const anyDoctor = await prisma.provider.findFirst();
      if (anyDoctor) {
        console.log(`⚠️ No visit relationship found - assigning to first available doctor: ${anyDoctor.id}`);
        return anyDoctor;
      }

      console.warn(`❌ No doctor found for patient ${patientId}`);
      return null;
    } catch (error) {
      console.error('Error getting doctor for patient:', error);
      return null;
    }
  }

  /**
   * Helper: Generate Image Preview
   */
  private static async generateImagePreview(
    filePath: string,
    format: 'thumbnail' | 'full',
    baseData: any
  ): Promise<any> {
    try {
      let previewBuffer: Buffer;

      if (format === 'thumbnail') {
        // Generate 150x150px thumbnail
        previewBuffer = await sharp(filePath)
          .resize(150, 150, { fit: 'cover' })
          .toBuffer();
      } else {
        // Generate full preview (max 1000px width)
        previewBuffer = await sharp(filePath)
          .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
          .toBuffer();
      }

      // Convert to base64 data URL
      const base64 = previewBuffer.toString('base64');
      const mimeType = baseData.mimeType || 'image/jpeg';

      return {
        ...baseData,
        previewUrl: `data:${mimeType};base64,${base64}`,
        supportsPreview: true
      };
    } catch (error) {
      console.error('Error generating image preview:', error);
      throw error;
    }
  }

  /**
   * Helper: Generate PDF Preview
   * Note: Would need pdfjs or similar library for full implementation
   */
  private static async generatePdfPreview(
    filePath: string,
    format: 'thumbnail' | 'full',
    baseData: any
  ): Promise<any> {
    try {
      // For now, return metadata indicating it's a PDF
      // Full PDF preview would require pdfjs-dist library
      const stats = fs.statSync(filePath);

      return {
        ...baseData,
        previewUrl: null, // Would be populated with actual PDF preview
        supportsPreview: true,
        isPdf: true,
        fileSize: stats.size,
        note: 'PDF preview requires pdfjs-dist library'
      };
    } catch (error) {
      console.error('Error generating PDF preview:', error);
      throw error;
    }
  }

  /**
   * Helper: Get File Type Category
   */
  private static getFileType(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'document';
    return 'document';
  }

  /**
   * Helper: Download File from Storage
   * Placeholder - would integrate with actual storage service
   */
  private static async downloadFileFromStorage(
    storageUrl: string,
    storageKey: string
  ): Promise<string> {
    try {
      // In production, this would download from Supabase or similar
      // For now, assume files are already in local filesystem
      const localPath = path.join(process.cwd(), 'uploads', storageKey);
      if (fs.existsSync(localPath)) {
        return localPath;
      }

      throw new Error(`File not found: ${localPath}`);
    } catch (error) {
      console.error('Error downloading file from storage:', error);
      throw error;
    }
  }

  /**
   * Helper: Log Audit Event
   */
  private static async logAuditEvent(data: any): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          actorType: data.actorType,
          actorId: data.actorId,
          action: data.action,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          rationale: data.rationale,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent
        }
      });
    } catch (error) {
      console.error('Error logging audit event:', error);
      // Don't throw - audit logging failure shouldn't break the operation
    }
  }
}

export default FileService;
