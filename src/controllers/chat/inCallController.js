// src/controllers/chat/inCallController.js
import Conversation from '../../models/Conversation.js';
import Message from '../../models/Message.js';
import CommunicationSession from '../../models/CommunicationSession.js';
import { 
  MESSAGE_TYPES, 
  EMOJI_CLEANUP_TIMEOUT, 
  isValidCallEmoji 
} from '../../utils/chatConstants.js';

// ============= IN-MEMORY EMOJI STORE =============
// Format: Map<sessionId, Array<{ emoji, senderId, senderType, timestamp }>>
const activeCallEmojis = new Map();

/**
 * Cleanup old emojis (older than EMOJI_CLEANUP_TIMEOUT)
 */
const cleanupEmojis = (sessionId) => {
  const emojis = activeCallEmojis.get(sessionId) || [];
  const now = Date.now();
  const filtered = emojis.filter(e => now - e.timestamp < EMOJI_CLEANUP_TIMEOUT);
  
  if (filtered.length > 0) {
    activeCallEmojis.set(sessionId, filtered);
  } else {
    activeCallEmojis.delete(sessionId);
  }
};

/**
 * Cleanup all emojis for a session (called when session ends)
 * Exported for use in communicationController.js
 */
export const cleanupSessionEmojis = (sessionId) => {
  activeCallEmojis.delete(sessionId.toString());
  console.log('🧹 Cleaned up emojis for session:', sessionId);
};

// ============= IN-CALL MESSAGE APIs =============

/**
 * POST /api/chat/call/:sessionId/message
 * Send a message during an active call
 */
export const sendInCallMessage = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const { content, messageType = MESSAGE_TYPES.TEXT } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Content required' });
    }

    // Verify session exists and user is participant
    const session = await CommunicationSession.findOne({
      _id: sessionId,
      $or: [{ customer: userId }, { consultant: userId }],
      status: { $in: ['ringing', 'active'] }
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Active session not found' });
    }

    // Get or create conversation between the two users
    const conversation = await Conversation.findOrCreateConversation(
      session.customer,
      session.consultant
    );

    // Determine receiver
    const receiverId = session.customer.toString() === userId.toString()
      ? session.consultant
      : session.customer;

    // Create message
    const message = await Message.create({
      conversationId: conversation._id,
      sender: userId,
      receiver: receiverId,
      content,
      messageType,
      duringCall: true,
      sessionId: session._id,
      deliveredAt: new Date()
    });

    // Update conversation last message (don't increment unread during call)
    conversation.updateLastMessage(
      messageType === MESSAGE_TYPES.TEXT ? content : `[${messageType}]`,
      userId,
      messageType
    );
    await conversation.save();

    // Populate sender for response
    await message.populate('sender', 'name avatar');

    res.json({
      success: true,
      data: { 
        message, 
        conversationId: conversation._id 
      }
    });
  } catch (err) {
    console.error('❌ sendInCallMessage error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * GET /api/chat/call/:sessionId/messages
 * Get messages for an active call session
 */
export const getInCallMessages = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const { since } = req.query;

    // Verify session exists and user is participant
    const session = await CommunicationSession.findOne({
      _id: sessionId,
      $or: [{ customer: userId }, { consultant: userId }]
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    // Get in-call messages using static method
    const messages = await Message.getInCallMessages(sessionId, since);

    res.json({
      success: true,
      data: {
        messages,
        serverTime: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('❌ getInCallMessages error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ============= IN-CALL EMOJI APIs =============

/**
 * POST /api/chat/call/:sessionId/emoji
 * Send an emoji reaction during a call (real-time, stored in memory)
 */
export const sendCallEmoji = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ success: false, error: 'emoji required' });
    }

    // Validate emoji
    if (!isValidCallEmoji(emoji)) {
      return res.status(400).json({ success: false, error: 'Invalid emoji' });
    }

    // Verify session exists and user is participant
    const session = await CommunicationSession.findOne({
      _id: sessionId,
      $or: [{ customer: userId }, { consultant: userId }],
      status: 'active'
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Active session not found' });
    }

    // Determine sender type
    const senderType = session.customer.toString() === userId.toString()
      ? 'customer'
      : 'consultant';

    // Create emoji data
    const emojiData = {
      emoji,
      senderId: userId.toString(),
      senderType,
      timestamp: Date.now()
    };

    // Add to in-memory store
    const sessionKey = sessionId.toString();
    if (!activeCallEmojis.has(sessionKey)) {
      activeCallEmojis.set(sessionKey, []);
    }
    activeCallEmojis.get(sessionKey).push(emojiData);

    // Cleanup old emojis
    cleanupEmojis(sessionKey);

    console.log(`😀 Emoji sent in session ${sessionId}: ${emoji} by ${senderType}`);

    res.json({
      success: true,
      data: { emoji: emojiData }
    });
  } catch (err) {
    console.error('❌ sendCallEmoji error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * GET /api/chat/call/:sessionId/emoji/poll
 * Poll for emoji reactions during a call
 */
export const pollCallEmojis = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const { since } = req.query;

    // Verify session exists and user is participant
    const session = await CommunicationSession.findOne({
      _id: sessionId,
      $or: [{ customer: userId }, { consultant: userId }],
      status: 'active'
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Active session not found' });
    }

    const sessionKey = sessionId.toString();

    // Cleanup old emojis
    cleanupEmojis(sessionKey);

    // Get emojis
    let emojis = activeCallEmojis.get(sessionKey) || [];

    // Filter by timestamp if since provided
    if (since) {
      const sinceTs = parseInt(since);
      emojis = emojis.filter(e => e.timestamp > sinceTs);
    }

    // Filter out emojis sent by current user (they don't need their own)
    emojis = emojis.filter(e => e.senderId !== userId.toString());

    res.json({
      success: true,
      data: {
        emojis,
        serverTime: Date.now()
      }
    });
  } catch (err) {
    console.error('❌ pollCallEmojis error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};