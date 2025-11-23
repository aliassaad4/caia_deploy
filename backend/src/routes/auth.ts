import { Router } from 'express';
import { register, login, logout, magicLink } from '../controllers/authController';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.post('/magic-link', magicLink);

export default router;
