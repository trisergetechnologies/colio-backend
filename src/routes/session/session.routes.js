import express from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { sessionParticipantMiddleware, activeSessionMiddleware } from '../../middlewares/session.middleware.js';
// import { validateRequest, validationSchemas } from '../../middlewares/validation.middleware.js';
import { messageRateLimit, uploadRateLimit } from '../../middlewares/rateLimit.middleware.js';
import { canContinueSession } from '../../controllers/session/sessionPolling.controller.js';

// ✅ 1. UPDATED IMPORT: Added endSession here
import { getSessionStatus, endSession } from '../../controllers/session/session.controller.js';

const router = express.Router();

// Apply auth middleware to all session routes
router.use(authMiddleware);

router.post('/:sessionId/upload', 
  uploadRateLimit,
  sessionParticipantMiddleware,
  activeSessionMiddleware,
  (req,res)=>{console.log("hey")}
);

router.get(
  '/:sessionId/can-continue',
  authMiddleware,
  canContinueSession
);

router.get('/:sessionId/status', authMiddleware, getSessionStatus);

// ✅ 2. NEW ROUTE: This catches the end call request and runs our race-condition fix
router.post('/:sessionId/end', endSession);

export default router;