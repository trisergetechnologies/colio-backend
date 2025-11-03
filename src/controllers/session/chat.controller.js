// 32. POST /api/session/:sessionId/message    # sendMessage()
// 33. GET  /api/session/:sessionId/messages   # getChatHistory()
// 34. PUT  /api/session/:sessionId/read       # markMessagesAsRead()
// 35. POST /api/session/:sessionId/typing     # sendTypingIndicator()
// 36. POST /api/session/:sessionId/upload     # uploadFileInChat()


import ChatMessage from '../../models/ChatMessage.js';
import Session from '../../models/Session.js';
import User from '../../models/User.js';
import settingsService from '../../services/settingsService.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

/**
 * Send message in chat session
 * @route POST /api/session/:sessionId/message
 * @desc Send a message in an active chat session
 * @access Private (Session participants only)
 */
export const sendMessage = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { content, messageType = 'text' } = req.body;
    const senderId = req.user.userId;

    // Input validation
    if (!content || content.trim().length === 0) {
      return res.status(200).json({
        success: false,
        message: 'Message content is required',
        data: null
      });
    }

    if (content.length > 1000) {
      return res.status(200).json({
        success: false,
        message: 'Message cannot exceed 1000 characters',
        data: null
      });
    }

    // Find session and verify it's ongoing
    const session = await Session.findById(sessionId)
      .populate('customer', 'name')
      .populate('consultant', 'name');

    if (!session) {
      return res.status(200).json({
        success: false,
        message: 'Session not found',
        data: null
      });
    }

    if (session.status !== 'ongoing') {
      return res.status(200).json({
        success: false,
        message: `Cannot send message. Session status: ${session.status}`,
        data: null
      });
    }

    // Verify sender is participant
    if (session.customer._id.toString() !== senderId.toString() && session.consultant._id.toString() !== senderId.toString()) {
      return res.status(200).json({
        success: false,
        message: 'Unauthorized to send message in this session',
        data: null
      });
    }

    // Determine receiver
    const receiverId = session.customer._id.toString() === senderId.toString()
      ? session.consultant._id 
      : session.customer._id;

    // Create message
    const message = await ChatMessage.create({
      conversationId: session.conversationId,
      sessionId: session._id,
      sender: senderId,
      receiver: receiverId,
      content: content.trim(),
      messageType: messageType,
      status: 'sent'
    });

    // Update session activity
    session.lastMessageAt = new Date();
    session.messageCount += 1;
    session.lastActivity = new Date();
    await session.save();

    // Populate sender information for response
    await message.populate('sender', 'name avatar role');
    await message.populate('receiver', 'name avatar role');

    // Prepare response data
    const responseData = {
      messageId: message._id,
      conversationId: message.conversationId,
      sessionId: message.sessionId,
      content: message.content,
      messageType: message.messageType,
      messageNumber: message.messageNumber,
      sender: {
        id: message.sender._id,
        name: message.sender.name,
        avatar: message.sender.avatar,
        role: message.sender.role
      },
      receiver: {
        id: message.receiver._id,
        name: message.receiver.name,
        avatar: message.receiver.avatar,
        role: message.receiver.role
      },
      sentAt: message.sentAt,
      status: message.status
    };

    // TODO: Emit Socket.io event for real-time delivery
    // io.to(`user_${receiverId}`).emit('message:received', responseData);
    // io.to(`session_${sessionId}`).emit('message:new', responseData);

    return res.status(200).json({
      success: true,
      message: 'Message sent successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send message',
      data: null
    });
  }
};

/**
 * Get chat history
 * @route GET /api/session/:sessionId/messages
 * @desc Get paginated chat messages for a session
 * @access Private (Session participants only)
 */
export const getChatHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { page = 1, limit = 50, before } = req.query;
    const userId = req.user.userId;

    // Find session and verify access
    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(200).json({
        success: false,
        message: 'Session not found',
        data: null
      });
    }

    // Verify user is participant
    if (session.customer.toString() !== userId && session.consultant.toString() !== userId) {
      return res.status(200).json({
        success: false,
        message: 'Unauthorized to view this chat',
        data: null
      });
    }

    // Build query for messages
    const query = {
      conversationId: session.conversationId,
      isDeleted: false
    };

    // Add before filter for pagination
    if (before) {
      query.sentAt = { $lt: new Date(before) };
    }

    // Get messages with pagination
    const messages = await ChatMessage.find(query)
      .populate('sender', 'name avatar role')
      .populate('receiver', 'name avatar role')
      .sort({ sentAt: -1 })
      .limit(parseInt(limit));

    // Get total message count
    const totalMessages = await ChatMessage.countDocuments({
      conversationId: session.conversationId,
      isDeleted: false
    });

    // Format messages for response
    const formattedMessages = messages.map(message => ({
      messageId: message._id,
      content: message.content,
      messageType: message.messageType,
      messageNumber: message.messageNumber,
      sender: {
        id: message.sender._id,
        name: message.sender.name,
        avatar: message.sender.avatar,
        role: message.sender.role
      },
      attachments: message.attachments,
      sentAt: message.sentAt,
      deliveredAt: message.deliveredAt,
      readAt: message.readAt,
      status: message.status,
      isEdited: message.isEdited,
      editedAt: message.editedAt
    }));

    // Calculate pagination info
    const hasMoreMessages = messages.length === parseInt(limit);
    const oldestMessageTime = messages.length > 0 ? messages[messages.length - 1].sentAt : null;

    const responseData = {
      messages: formattedMessages.reverse(), // Reverse to show chronological order
      pagination: {
        currentPage: parseInt(page),
        messagesPerPage: parseInt(limit),
        totalMessages,
        hasMoreMessages,
        oldestMessageTime
      },
      sessionInfo: {
        sessionId: session._id,
        conversationId: session.conversationId,
        sessionNumber: session.sessionNumber,
        status: session.status,
        participants: {
          customer: session.customer,
          consultant: session.consultant
        }
      }
    };

    return res.status(200).json({
      success: true,
      message: 'Chat history retrieved successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Get chat history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve chat history',
      data: null
    });
  }
};

/**
 * Mark messages as read
 * @route PUT /api/session/:sessionId/read
 * @desc Mark messages as read for the current user
 * @access Private (Session participants only)
 */
export const markMessagesAsRead = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;

    // Find session and verify access
    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(200).json({
        success: false,
        message: 'Session not found',
        data: null
      });
    }

    // Verify user is participant
    if (session.customer.toString() !== userId && session.consultant.toString() !== userId) {
      return res.status(200).json({
        success: false,
        message: 'Unauthorized to update read status',
        data: null
      });
    }

    // Mark messages as read
    const updateResult = await ChatMessage.markMessagesAsRead(session.conversationId, userId);

    // Get updated unread count for user
    const unreadCount = await ChatMessage.getUnreadCount(userId);

    // TODO: Emit Socket.io event for read receipt
    // const otherParticipantId = session.customer.toString() === userId ? session.consultant : session.customer;
    // io.to(`user_${otherParticipantId}`).emit('messages:read', {
    //   conversationId: session.conversationId,
    //   readBy: userId,
    //   readAt: new Date()
    // });

    return res.status(200).json({
      success: true,
      message: 'Messages marked as read',
      data: {
        conversationId: session.conversationId,
        messagesUpdated: updateResult.modifiedCount,
        unreadCount: unreadCount,
        readAt: new Date()
      }
    });

  } catch (error) {
    console.error('Mark messages as read error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to mark messages as read',
      data: null
    });
  }
};

/**
 * Send typing indicator
 * @route POST /api/session/:sessionId/typing
 * @desc Send typing indicator to other participant
 * @access Private (Session participants only)
 */
export const sendTypingIndicator = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { isTyping = true } = req.body;
    const userId = req.user.userId;

    // Find session and verify access
    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(200).json({
        success: false,
        message: 'Session not found',
        data: null
      });
    }

    // Verify user is participant and session is active
    if (session.customer.toString() !== userId && session.consultant.toString() !== userId) {
      return res.status(200).json({
        success: false,
        message: 'Unauthorized to send typing indicator',
        data: null
      });
    }

    if (session.status !== 'ongoing') {
      return res.status(200).json({
        success: false,
        message: 'Can only send typing indicator in ongoing sessions',
        data: null
      });
    }

    // Get sender info
    const sender = await User.findById(userId).select('name role');
    
    // Determine receiver
    const receiverId = session.customer.toString() === userId ? session.consultant : session.customer;

    // TODO: Emit Socket.io event for real-time typing indicator
    // io.to(`user_${receiverId}`).emit('typing:indicator', {
    //   sessionId: session._id,
    //   conversationId: session.conversationId,
    //   sender: {
    //     id: userId,
    //     name: sender.name,
    //     role: sender.role
    //   },
    //   isTyping: isTyping,
    //   timestamp: new Date()
    // });

    return res.status(200).json({
      success: true,
      message: `Typing indicator ${isTyping ? 'sent' : 'cleared'}`,
      data: {
        sessionId: session._id,
        isTyping: isTyping,
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error('Send typing indicator error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send typing indicator',
      data: null
    });
  }
};

/**
 * Upload file in chat
 * @route POST /api/session/:sessionId/upload
 * @desc Upload and send file attachment in chat
 * @access Private (Session participants only)
 */
export const uploadFileInChat = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const senderId = req.user.userId;

    // Find session and verify access
    const session = await Session.findById(sessionId)
      .populate('customer', 'name')
      .populate('consultant', 'name');

    if (!session) {
      return res.status(200).json({
        success: false,
        message: 'Session not found',
        data: null
      });
    }

    if (session.status !== 'ongoing') {
      return res.status(200).json({
        success: false,
        message: 'Can only upload files in ongoing sessions',
        data: null
      });
    }

    // Verify sender is participant
    if (session.customer._id.toString() !== senderId && session.consultant._id.toString() !== senderId) {
      return res.status(200).json({
        success: false,
        message: 'Unauthorized to upload files in this session',
        data: null
      });
    }

    // Check if file attachments are enabled
    const attachmentsEnabled = await settingsService.getSetting('features.enableChatAttachments');
    if (!attachmentsEnabled) {
      return res.status(200).json({
        success: false,
        message: 'File attachments are currently disabled',
        data: null
      });
    }

    // Configure multer for file upload
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadPath = `uploads/chat/${session.conversationId}`;
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
      },
      filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${file.originalname}`;
        cb(null, uniqueName);
      }
    });

    const maxFileSize = await settingsService.getSetting('communication.maxFileUploadSizeMB');
    const allowedTypes = await settingsService.getSetting('communication.allowedFileTypes');

    const upload = multer({
      storage: storage,
      limits: {
        fileSize: maxFileSize * 1024 * 1024 // Convert MB to bytes
      },
      fileFilter: (req, file, cb) => {
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error(`File type ${file.mimetype} not allowed. Allowed types: ${allowedTypes.join(', ')}`));
        }
      }
    }).single('file');

    upload(req, res, async (err) => {
      if (err) {
        return res.status(200).json({
          success: false,
          message: err.message || 'File upload failed',
          data: null
        });
      }

      if (!req.file) {
        return res.status(200).json({
          success: false,
          message: 'No file uploaded',
          data: null
        });
      }

      try {
        // Determine receiver
        const receiverId = session.customer._id.toString() === senderId 
          ? session.consultant._id 
          : session.customer._id;

        // Create message with file attachment
        const message = await ChatMessage.create({
          conversationId: session.conversationId,
          sessionId: session._id,
          sender: senderId,
          receiver: receiverId,
          content: `Shared ${req.file.originalname}`,
          messageType: req.file.mimetype.startsWith('image/') ? 'image' : 'file',
          attachments: [{
            filename: req.file.filename,
            originalName: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            url: `/uploads/chat/${session.conversationId}/${req.file.filename}`
          }],
          status: 'sent'
        });

        // Update session activity
        session.lastMessageAt = new Date();
        session.messageCount += 1;
        session.lastActivity = new Date();
        await session.save();

        // Populate sender information
        await message.populate('sender', 'name avatar role');
        await message.populate('receiver', 'name avatar role');

        // Prepare response data
        const responseData = {
          messageId: message._id,
          conversationId: message.conversationId,
          sessionId: message.sessionId,
          content: message.content,
          messageType: message.messageType,
          messageNumber: message.messageNumber,
          sender: {
            id: message.sender._id,
            name: message.sender.name,
            avatar: message.sender.avatar,
            role: message.sender.role
          },
          attachments: message.attachments,
          sentAt: message.sentAt,
          status: message.status
        };

        // TODO: Emit Socket.io event for real-time delivery
        // io.to(`user_${receiverId}`).emit('message:received', responseData);
        // io.to(`session_${sessionId}`).emit('message:new', responseData);

        return res.status(200).json({
          success: true,
          message: 'File uploaded and sent successfully',
          data: responseData
        });

      } catch (dbError) {
        // Delete uploaded file if database operation fails
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        
        console.error('Database error after file upload:', dbError);
        return res.status(500).json({
          success: false,
          message: 'Failed to save file message',
          data: null
        });
      }
    });

  } catch (error) {
    console.error('Upload file in chat error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload file',
      data: null
    });
  }
};