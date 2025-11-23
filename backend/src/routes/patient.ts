import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getProfile,
  updateProfile,
  getRecords,
  getLastVisit,
  getOpenTasks,
  uploadFile,
  uploadMiddleware,
} from '../controllers/patientController';

const router = Router();

// All patient routes require authentication
router.use(authenticate);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.get('/records', getRecords);
router.get('/last-visit', getLastVisit);
router.get('/tasks/open', getOpenTasks);
router.post('/upload', uploadMiddleware, uploadFile);

export default router;
