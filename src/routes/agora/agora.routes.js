// routes/agora.routes.js
import express from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { body, param, query } from 'express-validator';

// Import controllers
import {
    generateRTMToken,
    generateRTCToken,
    generateSessionTokens,
    refreshToken
} from '../../controllers/agora/agora.controller.js';

import {
    storeMessage,
    getConversationHistory,
    markMessagesAsRead,
    getUnreadCount
} from '../../controllers/agora/chat.controller.js';

import {
    initiateCall,
    answerCall,
    endCall,
    declineCall,
    getCallHistory
} from '../../controllers/agora/call.controller.js';

const router = express.Router();

// ============= AGORA TOKEN ROUTES =============

// Generate RTM token for chat
router.post(
    '/tokens/rtm',
    authMiddleware,
    generateRTMToken
);

// Generate RTC token for calls
router.post(
    '/tokens/rtc',
    authMiddleware,
    [
        body('channelName').notEmpty().withMessage('Channel name is required'),
        body('role').optional().isIn(['publisher', 'subscriber'])
    ],
    generateRTCToken
);

// Generate both tokens for a session
router.post(
    '/tokens/session/:sessionId',
    authMiddleware,
    [param('sessionId').isMongoId()],
    generateSessionTokens
);

// Refresh expired token
router.post(
    '/tokens/refresh',
    authMiddleware,
    [
        body('tokenType').isIn(['rtm', 'rtc']),
        body('channelName').optional().notEmpty()
    ],
    refreshToken
);

// ============= CHAT MESSAGE ROUTES =============

// Store message after sending via RTM
router.post(
    '/chat/messages',
    authMiddleware,
    [
        body('sessionId').isMongoId(),
        body('content').notEmpty().isLength({ max: 1000 }),
        body('messageType').optional().isIn(['text', 'image', 'file', 'system'])
    ],
    storeMessage
);

// Get conversation history
router.get(
    '/chat/conversations/:conversationId',
    authMiddleware,
    [
        param('conversationId').notEmpty(),
        query('page').optional().isInt({ min: 1 }),
        query('limit').optional().isInt({ min: 1, max: 100 })
    ],
    getConversationHistory
);

// Mark messages as read
router.patch(
    '/chat/conversations/:conversationId/read',
    authMiddleware,
    [param('conversationId').notEmpty()],
    markMessagesAsRead
);

// Get unread message count
router.get(
    '/chat/unread',
    authMiddleware,
    getUnreadCount
);

// ============= VOICE/VIDEO CALL ROUTES =============

// ... continuing agora.routes.js

// Initiate a call
router.post(
    '/calls/initiate',
    authMiddleware,
    [
        body('sessionId').isMongoId(),
        body('callType').optional().isIn(['voice', 'video'])
    ],
    initiateCall
);

// Answer a call
router.post(
    '/calls/:callId/answer',
    authMiddleware,
    [param('callId').isMongoId()],
    answerCall
);

// End a call
router.post(
    '/calls/:callId/end',
    authMiddleware,
    [
        param('callId').isMongoId(),
        body('endReason').optional().isIn(['completed', 'declined', 'no_answer', 'busy', 'failed', 'cancelled', 'network_error'])
    ],
    endCall
);

// Decline a call
router.post(
    '/calls/:callId/decline',
    authMiddleware,
    [param('callId').isMongoId()],
    declineCall
);

// Get call history
router.get(
    '/calls/history',
    authMiddleware,
    [
        query('page').optional().isInt({ min: 1 }),
        query('limit').optional().isInt({ min: 1, max: 50 })
    ],
    getCallHistory
);

export default router;