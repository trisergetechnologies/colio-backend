// src/controllers/chat/chatController.js
import Conversation from '../../models/Conversation.js';
import Message from '../../models/Message.js';
import User from '../../models/User.js';
import { MESSAGE_TYPES, PAGINATION } from '../../utils/chatConstants.js';
import { isBlockedEitherWay } from "../../utils/block.helper.js";

// ✅ Helper function to safely get unread count (handles both Map and plain object)
const getUnreadCountForUser = (conversation, userId) => {
  const userIdStr = userId.toString();
  const unreadMap = conversation.unreadCount;
  
  if (!unreadMap) return 0;
  
  // If it's a Map (Mongoose document)
  if (typeof unreadMap.get === 'function') {
    return unreadMap.get(userIdStr) || 0;
  }
  
  // If it's a plain object (from .lean() or JSON)
  if (typeof unreadMap === 'object') {
    return unreadMap[userIdStr] || 0;
  }
  
  return 0;
};

/**
 * GET /api/chat/conversations
 * Get all conversations for current user
 */
export const getConversations = async (req, res) => {
  try {
    const userId = req.user.userId;

    const conversations = await Conversation.find({
      participants: userId,
      isActive: true
    })
      .populate('participants', 'name avatar role consultantProfile.availabilityStatus')
      .sort({ 'lastMessage.createdAt': -1, updatedAt: -1 })
      .lean();

    // Format response with other participant info
    const formatted = conversations.map(conv => {
      const otherParticipant = conv.participants.find(
        p => p._id.toString() !== userId.toString()
      );

      return {
        id: conv._id,
        participant: {
          id: otherParticipant?._id,
          name: otherParticipant?.name,
          avatar: otherParticipant?.avatar,
          role: otherParticipant?.role,
          availabilityStatus: otherParticipant?.consultantProfile?.availabilityStatus || null
        },
        lastMessage: conv.lastMessage,
        unreadCount: getUnreadCountForUser(conv, userId), // ✅ FIXED
        updatedAt: conv.updatedAt
      };
    });

    res.json({
      success: true,
      data: { conversations: formatted }
    });
  } catch (err) {
    console.error('❌ getConversations error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * POST /api/chat/conversations/start
 * Start or get existing conversation with another user
 */
export const startConversation = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { participantId } = req.body;

    if (!participantId) {
      return res.status(400).json({ success: false, error: 'participantId required' });
    }

    // Verify participant exists
    const participant = await User.findById(participantId)
      .select('name avatar role consultantProfile.availabilityStatus');

    if (!participant) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const currentUser = await User.findById(userId).select("blockedUsers");

    if (isBlockedEitherWay(currentUser, participant)) {
      return res.status(200).json({
        success: false,
        message: "You cannot start a conversation with this user",
        data: null,
      });
    }

    // Find or create conversation
    const conversation = await Conversation.findOrCreateConversation(userId, participantId);

    res.json({
      success: true,
      data: {
        conversation: {
          id: conversation._id,
          participant: {
            id: participant._id,
            name: participant.name,
            avatar: participant.avatar,
            role: participant.role,
            availabilityStatus: participant.consultantProfile?.availabilityStatus || null
          },
          lastMessage: conversation.lastMessage,
          unreadCount: getUnreadCountForUser(conversation, userId) // ✅ FIXED
        }
      }
    });
  } catch (err) {
    console.error('❌ startConversation error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * GET /api/chat/conversations/:conversationId/messages
 * Get messages for a conversation (paginated)
 */
export const getMessages = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.params;
    const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
    const limit = Math.min(
      parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT,
      PAGINATION.MAX_LIMIT
    );

    // Verify user is participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    });

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Get messages using static method
    const messages = await Message.getConversationMessages(
      conversationId,
      userId,
      page,
      limit
    );

    // Get total count for pagination
    const total = await Message.countDocuments({
      conversationId,
      deletedFor: { $ne: userId }
    });

    const skip = (page - 1) * limit;

    res.json({
      success: true,
      data: {
        messages,
        pagination: {
          page,
          limit,
          total,
          hasMore: skip + messages.length < total
        }
      }
    });
  } catch (err) {
    console.error('❌ getMessages error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * POST /api/chat/conversations/:conversationId/messages
 * Send a new message
 */
export const sendMessage = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.params;
    const { content, messageType = MESSAGE_TYPES.TEXT } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Content required' });
    }

    // Verify user is participant and get conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    });

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Find receiver (other participant)
    const receiverId = conversation.participants.find(
      p => p.toString() !== userId.toString()
    );

    // 🔒 BLOCK CHECK (MANDATORY)
    const [currentUser, receiver] = await Promise.all([
      User.findById(userId).select('blockedUsers'),
      User.findById(receiverId).select('blockedUsers')
    ]);

    if (isBlockedEitherWay(currentUser, receiver)) {
      return res.status(200).json({
        success: false,
        message: 'You cannot send messages to this user',
        data: null
      });
    }

    const message = await Message.create({
      conversationId,
      sender: userId,
      receiver: receiverId,
      content,
      messageType,
      deliveredAt: new Date()
    });

    // Update conversation
    conversation.updateLastMessage(
      messageType === MESSAGE_TYPES.TEXT ? content : `[${messageType}]`,
      userId,
      messageType
    );
    conversation.incrementUnread(receiverId);
    await conversation.save();

    // Populate sender for response
    await message.populate('sender', 'name avatar');

    res.json({
      success: true,
      data: { message }
    });
  } catch (err) {
    console.error('❌ sendMessage error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * PUT /api/chat/conversations/:conversationId/read
 * Mark all messages as read
 */
export const markAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    });

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Mark messages as read using static method
    await Message.markAsRead(conversationId, userId);

    // Reset unread count
    conversation.resetUnread(userId);
    await conversation.save();

    res.json({ success: true });
  } catch (err) {
    console.error('❌ markAsRead error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * GET /api/chat/conversations/:conversationId/poll
 * Poll for new messages since a timestamp
 */
export const pollMessages = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.params;
    const { since } = req.query;

    if (!since) {
      return res.status(400).json({ success: false, error: 'since timestamp required' });
    }

    // Verify user is participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    });

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Get messages since timestamp using static method
    const messages = await Message.getMessagesSince(conversationId, userId, since);

    res.json({
      success: true,
      data: {
        messages,
        serverTime: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('❌ pollMessages error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * GET /api/chat/unread-count
 * Get total unread message count for current user
 */
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.userId;

    const conversations = await Conversation.find({
      participants: userId,
      isActive: true
    }).lean();

    let totalUnread = 0;
    conversations.forEach(conv => {
      totalUnread += getUnreadCountForUser(conv, userId); // ✅ FIXED - use helper
    });

    res.json({
      success: true,
      data: { unreadCount: totalUnread }
    });
  } catch (err) {
    console.error('❌ getUnreadCount error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * GET /api/chat/conversations/:conversationId
 * Get single conversation details
 */
export const getConversation = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    }).populate('participants', 'name avatar role consultantProfile.availabilityStatus');

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const otherParticipant = conversation.participants.find(
      p => p._id.toString() !== userId.toString()
    );

    res.json({
      success: true,
      data: {
        conversation: {
          id: conversation._id,
          participant: {
            id: otherParticipant?._id,
            name: otherParticipant?.name,
            avatar: otherParticipant?.avatar,
            role: otherParticipant?.role,
            availabilityStatus: otherParticipant?.consultantProfile?.availabilityStatus || null
          },
          lastMessage: conversation.lastMessage,
          unreadCount: getUnreadCountForUser(conversation, userId), // ✅ FIXED
          updatedAt: conversation.updatedAt
        }
      }
    });
  } catch (err) {
    console.error('❌ getConversation error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};