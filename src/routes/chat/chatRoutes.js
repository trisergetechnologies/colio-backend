// src/routes/chat/chatRoutes.js
import express from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

// Chat controller
import {
  getConversations,
  startConversation,
  getConversation,
  getMessages,
  sendMessage,
  markAsRead,
  pollMessages,
  getUnreadCount
} from '../../controllers/chat/chatController.js';

// In-call controller
import {
  sendInCallMessage,
  getInCallMessages,
  sendCallEmoji,
  pollCallEmojis
} from '../../controllers/chat/inCallController.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// ============================================
// CONVERSATION ROUTES
// ============================================

// Get all conversations for current user
router.get('/conversations', getConversations);

// Start or get existing conversation with a user
router.post('/conversations/start', startConversation);

// Get single conversation details
router.get('/conversations/:conversationId', getConversation);

// Get messages for a conversation (paginated)
router.get('/conversations/:conversationId/messages', getMessages);

// Send a message to a conversation
router.post('/conversations/:conversationId/messages', sendMessage);

// Mark conversation as read
router.put('/conversations/:conversationId/read', markAsRead);

// Poll for new messages (real-time updates)
router.get('/conversations/:conversationId/poll', pollMessages);

// Get total unread count across all conversations
router.get('/unread-count', getUnreadCount);

// ============================================
// IN-CALL CHAT ROUTES
// ============================================

// Send message during active call
router.post('/call/:sessionId/message', sendInCallMessage);

// Get messages for active call session
router.get('/call/:sessionId/messages', getInCallMessages);

// Send emoji reaction during call
router.post('/call/:sessionId/emoji', sendCallEmoji);

// Poll for emoji reactions during call
router.get('/call/:sessionId/emoji/poll', pollCallEmojis);

export default router;