import express from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { sessionParticipantMiddleware, activeSessionMiddleware } from '../../middlewares/session.middleware.js';
import { messageRateLimit, uploadRateLimit } from '../../middlewares/rateLimit.middleware.js';
import { canContinueSession } from '../../controllers/session/sessionPolling.controller.js';
import { getSessionStatus, endSession } from '../../controllers/session/session.controller.js';

const router = express.Router();

// ✅ Auth applied once for all routes below
router.use(authMiddleware);

router.post('/:sessionId/upload',
  uploadRateLimit,
  sessionParticipantMiddleware,
  activeSessionMiddleware,
  (req, res) => { console.log("hey"); }
);

router.get('/:sessionId/can-continue', canContinueSession);

router.get('/:sessionId/status', getSessionStatus);

// ✅ End/Cancel session — customer calls this when hanging up
router.post('/:sessionId/end', endSession);

export default router;