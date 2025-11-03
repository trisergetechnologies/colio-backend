import express from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { sessionParticipantMiddleware, activeSessionMiddleware } from '../../middlewares/session.middleware.js';
// import { validateRequest, validationSchemas } from '../../middlewares/validation.middleware.js';
import { messageRateLimit, uploadRateLimit } from '../../middlewares/rateLimit.middleware.js';

// Session chat controllers
import { 
  sendMessage, 
  getChatHistory, 
  markMessagesAsRead, 
  sendTypingIndicator, 
  uploadFileInChat 
} from '../../controllers/session/chat.controller.js';

const router = express.Router();

// Apply auth middleware to all session routes
router.use(authMiddleware);

// Chat Messaging (requires session participation)
router.post('/:sessionId/message', 
  messageRateLimit,
  sessionParticipantMiddleware,
  activeSessionMiddleware,
  // validateRequest(validationSchemas.sendMessage),
  sendMessage
);

router.get('/:sessionId/messages', 
  sessionParticipantMiddleware,
  getChatHistory
);

router.put('/:sessionId/read', 
  sessionParticipantMiddleware,
  markMessagesAsRead
);

router.post('/:sessionId/typing', 
  sessionParticipantMiddleware,
  activeSessionMiddleware,
  sendTypingIndicator
);

router.post('/:sessionId/upload', 
  uploadRateLimit,
  sessionParticipantMiddleware,
  activeSessionMiddleware,
  uploadFileInChat
);

export default router;