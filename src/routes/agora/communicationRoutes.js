// routes/communicationRoutes.js
import express from 'express';
import { startSession, getRtcToken, endSession } from '../../controllers/agora/communicationController.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/session/start', startSession);
router.post('/session/token/rtc', getRtcToken);
router.post('/session/end', endSession);

export default router;
