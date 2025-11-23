import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getAppointments,
  getCompletedVisits,
  getAvailableSlots,
  bookAppointment,
  rescheduleAppointment,
  cancelAppointment,
} from '../controllers/scheduleController';

const router = Router();

// All schedule routes require authentication
router.use(authenticate);

router.get('/appointments', getAppointments);
router.get('/completed-visits', getCompletedVisits);
router.get('/slots', getAvailableSlots);
router.post('/book', bookAppointment);
router.put('/appointments/:id', rescheduleAppointment);
router.delete('/appointments/:id', cancelAppointment);

export default router;
