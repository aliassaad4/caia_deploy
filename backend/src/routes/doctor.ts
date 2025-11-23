import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireRole } from '../middleware/auth';
import {
  registerDoctor,
  loginDoctor,
} from '../controllers/doctorAuthController';
import {
  getDashboardStats,
  getApprovalQueue,
  approveContent,
  rejectContent,
  editContentWithAI,
  updateApprovalContent,
  getQBoard,
  respondToQBoard,
  getTodayPatients,
  getCompletedVisits,
  getPatientDetails,
  processVisitRecording,
  getVisitProcessingStatus,
  getAllPatients,
  getPatientFullProfile,
  askPatientProfileQuestion,
  searchPatients,
  createManualVisit,
  getVisitSummary,
} from '../controllers/doctorController';
import {
  getSettings,
  updateSettings,
  getGoogleCalendarAuthUrl,
  googleCalendarCallback,
  disconnectGoogleCalendar,
  getAvailableTimeSlots,
} from '../controllers/doctorSettingsController';
import {
  getFileNotifications,
  markNotificationAsRead,
  archiveNotification,
  getFilePreview,
  getFileWithDetails,
  downloadFile,
} from '../controllers/fileController';

const router = Router();

// Configure multer for file uploads (in memory storage for audio files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files
    if (file.mimetype.startsWith('audio/') || file.mimetype === 'video/webm') {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
});

// Authentication (no auth required)
router.post('/auth/register', registerDoctor);
router.post('/auth/login', loginDoctor);

// Dashboard (requires auth)
router.get('/dashboard/stats', authenticate, requireRole(['doctor']), getDashboardStats);
router.get('/today-patients', authenticate, requireRole(['doctor']), getTodayPatients);
router.get('/completed-visits', authenticate, requireRole(['doctor']), getCompletedVisits);
router.get('/patients/:patientId', authenticate, requireRole(['doctor']), getPatientDetails);

// Patients Management (requires auth)
router.get('/patients', authenticate, requireRole(['doctor']), getAllPatients);
router.get('/patients/:patientId/full-profile', authenticate, requireRole(['doctor']), getPatientFullProfile);
router.post('/patients/:patientId/ask', authenticate, requireRole(['doctor']), askPatientProfileQuestion);

// Approval Queue (requires auth)
router.get('/approvals', authenticate, requireRole(['doctor']), getApprovalQueue);
router.post('/approvals/:id/approve', authenticate, requireRole(['doctor']), approveContent);
router.post('/approvals/:id/reject', authenticate, requireRole(['doctor']), rejectContent);
router.post('/approvals/:id/edit-with-ai', authenticate, requireRole(['doctor']), editContentWithAI);
router.put('/approvals/:id', authenticate, requireRole(['doctor']), updateApprovalContent);

// Q-Board (requires auth)
router.get('/qboard', authenticate, requireRole(['doctor']), getQBoard);
router.post('/qboard/:id/respond', authenticate, requireRole(['doctor']), respondToQBoard);

// Visit Recording (requires auth and file upload)
router.post(
  '/visits/:visitId/process-recording',
  authenticate,
  requireRole(['doctor']),
  upload.single('audio'),
  processVisitRecording
);

// Get visit processing status
router.get('/visits/:visitId/processing-status', authenticate, requireRole(['doctor']), getVisitProcessingStatus);

// Get visit summary (patient-friendly after-visit summary)
router.get('/visits/:visitId/summary', authenticate, requireRole(['doctor']), getVisitSummary);

// Search and Manual Visit Creation (requires auth)
router.get('/search-patients', authenticate, requireRole(['doctor']), searchPatients);
router.post('/manual-visit', authenticate, requireRole(['doctor']), createManualVisit);

// Settings (requires auth)
router.get('/settings', authenticate, requireRole(['doctor']), getSettings);
router.put('/settings', authenticate, requireRole(['doctor']), updateSettings);

// Calendar Integration (requires auth)
router.get('/calendar/google/auth-url', authenticate, requireRole(['doctor']), getGoogleCalendarAuthUrl);
router.get('/calendar/google/callback', googleCalendarCallback); // No auth required - OAuth callback
router.delete('/calendar/disconnect', authenticate, requireRole(['doctor']), disconnectGoogleCalendar);
router.get('/calendar/available-slots', authenticate, requireRole(['doctor']), getAvailableTimeSlots);

// File Notifications (requires auth) - MUST come before :fileId routes!
router.get('/files/notifications', authenticate, requireRole(['doctor']), getFileNotifications);
router.put('/files/notifications/:notificationId/read', authenticate, requireRole(['doctor']), markNotificationAsRead);
router.put('/files/notifications/:notificationId/archive', authenticate, requireRole(['doctor']), archiveNotification);

// File Access (requires auth)
router.get('/files/:fileId/preview', authenticate, requireRole(['doctor']), getFilePreview);
router.get('/files/:fileId/details', authenticate, requireRole(['doctor']), getFileWithDetails);
router.get('/files/:fileId', authenticate, requireRole(['doctor']), downloadFile);

export default router;
