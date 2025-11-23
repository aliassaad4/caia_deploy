import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getPatientChart,
  getPatientChartByDoctor,
  updatePatientChart,
  addTestResults,
} from '../controllers/patientChartController';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Patient routes
router.get('/my-chart', getPatientChart);

// Doctor routes
router.get('/:patientId', getPatientChartByDoctor);
router.put('/update', updatePatientChart);
router.post('/test-results', addTestResults);

export default router;
