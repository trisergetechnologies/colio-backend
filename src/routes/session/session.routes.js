import express from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { sessionParticipantMiddleware, activeSessionMiddleware } from '../../middlewares/session.middleware.js';
// import { validateRequest, validationSchemas } from '../../middlewares/validation.middleware.js';
import { messageRateLimit, uploadRateLimit } from '../../middlewares/rateLimit.middleware.js';



const router = express.Router();

// Apply auth middleware to all session routes
router.use(authMiddleware);


router.post('/:sessionId/upload', 
  uploadRateLimit,
  sessionParticipantMiddleware,
  activeSessionMiddleware,
  (req,res)=>{console.log("hey")}
);

export default router;