// routes/communicationRoutes.js
import express from 'express';
import { startSession, getRtcToken, endSession, getIncomingCalls, answerCall } from '../../controllers/agora/communicationController.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/session/start', startSession);
router.post('/session/token/rtc', getRtcToken);
router.post('/session/end', endSession);

// ✅ New polling endpoints
router.get('/incoming-calls', getIncomingCalls);
router.post('/call/answer', answerCall);  

export default router;
