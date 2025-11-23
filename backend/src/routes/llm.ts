import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { chat, generateNoteDraft, deleteAllMessages, analyzeFile } from '../controllers/llmController';

const router = Router();

// All LLM routes require authentication
router.use(authenticate);

router.post('/chat', chat);
router.post('/note-draft', generateNoteDraft);
router.post('/analyze-file', analyzeFile);
router.delete('/messages', deleteAllMessages);

export default router;
