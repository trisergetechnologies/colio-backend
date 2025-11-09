// routes/agoraRoutes.js
import express from 'express';
import { getChatToken, getRtcTokenGeneric } from '../../controllers/agora/agoraTokenController.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/chat/token', getChatToken);
router.post('/rtc/token', getRtcTokenGeneric);

export default router;
