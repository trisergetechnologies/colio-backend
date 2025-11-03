// controllers/chat.controller.js
import ChatMessage from '../../models/ChatMessage.js';
import Session from '../../models/Session.js';
import notificationService from '../../services/notification.service.js';

/**
 * Store message in database (called after sending via Agora RTM)
 */
export const storeMessage = async (req, res) => {
  try {
    const { sessionId, content, messageType = 'text', agoraMessageId } = req.body;
    const senderId = req.user._id;
    
    // Get session details
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    // Determine receiver
    const receiverId = session.customer.equals(senderId) 
      ? session.consultant 
      : session.customer;
    
    // Create message
    const message = await ChatMessage.create({
      conversationId: session.conversationId,
      sessionId,
      sender: senderId,
      receiver: receiverId,
      content,
      messageType,
      agoraMessageId,
      status: 'sent'
    });
    
    // Update session last message time
    session.lastMessageAt = new Date();
    session.messageCount += 1;
    await session.save();
    
    // Send push notification if receiver is offline
    const senderInfo = {
      id: senderId,
      name: req.user.name,
      conversationId: session.conversationId
    };
    
    await notificationService.sendMessageNotification(
      receiverId,
      senderInfo,
      content.substring(0, 100)
    );
    
    res.status(201).json({
      success: true,
      message: 'Message stored successfully',
      data: message
    });
  } catch (error) {
    console.error('Store message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to store message',
      error: error.message
    });
  }
};

/**
 * Get conversation history
 */
export const getConversationHistory = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user._id;
    
    // Verify user is part of this conversation
    const session = await Session.findOne({
      conversationId,
      $or: [{ customer: userId }, { consultant: userId }]
    });
    
    if (!session) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this conversation'
      });
    }
    
    // Get messages
    const messages = await ChatMessage.getConversationHistory(
      conversationId,
      page,
      limit
    );
    
    res.status(200).json({
      success: true,
      message: 'Conversation history fetched successfully',
      data: {
        messages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          hasMore: messages.length === parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get conversation history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversation history',
      error: error.message
    });
  }
};

/**
 * Mark messages as read
 */
export const markMessagesAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    
    await ChatMessage.markMessagesAsRead(conversationId, userId);
    
    res.status(200).json({
      success: true,
      message: 'Messages marked as read'
    });
  } catch (error) {
    console.error('Mark messages as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark messages as read',
      error: error.message
    });
  }
};

/**
 * Get unread message count
 */
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const count = await ChatMessage.getUnreadCount(userId);
    
    res.status(200).json({
      success: true,
      message: 'Unread count fetched successfully',
      data: { unreadCount: count }
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get unread count',
      error: error.message
    });
  }
};