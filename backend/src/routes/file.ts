import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import {
  uploadFile,
  downloadFile,
  getFiles,
  deleteFile,
  // New functions for enhanced file features
  getFilePreview,
  annotateFile,
  addFileComment,
  getFileVersions,
  getFileWithDetails,
  getFileNotifications,
  markNotificationAsRead,
  archiveNotification,
  serveLocalFile,
} from '../controllers/fileController';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// All file routes require authentication
router.use(authenticate);

// SIMPLE file serving endpoint - looks up file by ID and serves it
router.get('/serve/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Find the file record
    const file = await prisma.patientFile.findUnique({
      where: { id }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Build the file path
    const filePath = path.join(__dirname, '../../uploads', file.storageKey);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error('File not found on disk:', filePath);
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Set content type and send file
    res.setHeader('Content-Type', file.fileType);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// Original endpoints
router.post('/upload', upload.single('file'), uploadFile);
router.get('/patient/files', getFiles);
router.get('/local/:patientId/:filename', serveLocalFile);

// Patient file operations - these need to be at the root level
router.delete('/:fileId', deleteFile); // Patient file deletion
router.get('/:id', downloadFile); // Download file

// New enhanced file endpoints (Feature 3-5: Preview, Annotations, Comments, Versions)
router.get('/patient/files/:fileId/preview', getFilePreview);
router.get('/patient/files/:fileId/versions', getFileVersions);
router.get('/patient/files/:fileId/details', getFileWithDetails);
router.get('/patient/files/:fileId', getFileWithDetails); // Alias for file details

// Doctor-only endpoints for annotations and comments
router.post('/doctor/files/:fileId/annotate', annotateFile);
router.post('/doctor/files/:fileId/comment', addFileComment);

// Doctor notification endpoints (MUST come before :fileId routes!)
router.get('/doctor/files/notifications', getFileNotifications);
router.put('/doctor/files/notifications/:notificationId/read', markNotificationAsRead);
router.put('/doctor/files/notifications/:notificationId/archive', archiveNotification);

// Doctor file access endpoints
router.get('/doctor/files/:fileId/preview', getFilePreview);
router.get('/doctor/files/:fileId/details', getFileWithDetails);
router.get('/doctor/files/:fileId', downloadFile);

export default router;
