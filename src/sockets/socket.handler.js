import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Session from '../models/Session.js';
import ChatMessage from '../models/ChatMessage.js';
import billingService from '../services/billingService.js';
import settingsService from '../services/settingsService.js';

class SocketHandler {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketId mapping
    this.userSessions = new Map(); // userId -> sessionId mapping
    this.typingTimeouts = new Map(); // sessionId -> timeout mapping
  }
  
  /**
   * Initialize Socket.io server
   */
  initialize(httpServer) {
  this.io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? process.env.FRONTEND_URL 
        : ['http://localhost:3000', 'http://localhost:19006', 'http://localhost:8080', null], // Add null for local files
      credentials: true,
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling']
  });

    // Authentication middleware
    this.io.use(this.authenticateSocket);

    // Connection handler
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    console.log('Socket.io server initialized for Talk Syne real-time communication');
    return this.io;
  }

  /**
   * Socket authentication middleware
   */
  authenticateSocket = async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || 
                   socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user details
      const user = await User.findById(decoded.userId)
        .select('name role isActive avatar consultantProfile.availabilityStatus');
      
      if (!user || !user.isActive) {
        return next(new Error('Invalid user or account inactive'));
      }

      // Add user info to socket
      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      socket.userName = user.name;
      socket.userAvatar = user.avatar;

      next();
    } catch (error) {
      console.error('Socket authentication error:', error.message);
      next(new Error('Authentication failed'));
    }
  }

  /**
   * Handle new socket connection
   */
  handleConnection = (socket) => {
    console.log(`User connected: ${socket.userName} (${socket.userId}) - Role: ${socket.userRole}`);

    // Store user connection
    this.connectedUsers.set(socket.userId, socket.id);

    // Join user to their personal room
    socket.join(`user_${socket.userId}`);

    // Emit user online status
    this.emitUserPresence(socket.userId, 'online');

    // Set up event handlers
    this.setupChatEvents(socket);
    this.setupSessionEvents(socket);
    this.setupBillingEvents(socket);
    this.setupPresenceEvents(socket);

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });

    // Send welcome message
    socket.emit('connection:established', {
      userId: socket.userId,
      role: socket.userRole,
      name: socket.userName,
      timestamp: new Date(),
      message: 'Connected to Talk Syne real-time services'
    });
  }

  /**
   * Set up chat-related socket events
   */
  setupChatEvents = (socket) => {
    // Real-time message sending
    socket.on('message:send', async (data) => {
      try {
        const { sessionId, content, messageType = 'text' } = data;
        
        if (!content || content.trim().length === 0) {
          socket.emit('message:error', { error: 'Message content is required' });
          return;
        }

        // Verify session and participant
        const session = await Session.findById(sessionId)
          .populate('customer', 'name avatar')
          .populate('consultant', 'name avatar');

        if (!session) {
          socket.emit('message:error', { error: 'Session not found' });
          return;
        }

        if (!this.isSessionParticipant(session, socket.userId)) {
          socket.emit('message:error', { error: 'Unauthorized to send message in this session' });
          return;
        }

        if (session.status !== 'ongoing') {
          socket.emit('message:error', { 
            error: `Cannot send message. Session status: ${session.status}` 
          });
          return;
        }

        // Check message length
        const maxLength = await settingsService.getSetting('maxMessageLength');
        if (content.length > maxLength) {
          socket.emit('message:error', { 
            error: `Message too long. Maximum ${maxLength} characters allowed` 
          });
          return;
        }

        // Determine receiver
        const receiverId = session.customer._id.toString() === socket.userId.toString()
          ? session.consultant._id 
          : session.customer._id;

        // Create message in database
        const message = new ChatMessage({
          conversationId: session.conversationId,
          sessionId: session._id,
          sender: socket.userId,
          receiver: receiverId,
          content: content.trim(),
          messageType,
          status: 'sent'
        });

        await message.save();
        await message.populate('sender', 'name avatar role');

        // Emit to receiver
        this.io.to(`user_${receiverId}`).emit('message:received', {
          messageId: message._id,
          conversationId: message.conversationId,
          sessionId: message.sessionId,
          content: message.content,
          messageType: message.messageType,
          sender: {
            id: message.sender._id,
            name: message.sender.name,
            avatar: message.sender.avatar,
            role: message.sender.role
          },
          sentAt: message.sentAt,
          status: message.status
        });

        // Confirm to sender
        socket.emit('message:sent', {
          messageId: message._id,
          status: 'delivered',
          sentAt: message.sentAt
        });

        // Update session activity
        await Session.findByIdAndUpdate(sessionId, {
          lastActivity: new Date(),
          lastMessageAt: message.sentAt,
          $inc: { messageCount: 1 }
        });

        // Clear typing indicator for sender
        this.clearTypingIndicator(sessionId, socket.userId);

      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('message:error', { error: 'Failed to send message' });
      }
    });

    // Typing indicators
    socket.on('typing:start', async (data) => {
      const { sessionId } = data;
      
      try {
        const session = await Session.findById(sessionId);
        
        if (session && this.isSessionParticipant(session, socket.userId)) {
          const receiverId = session.customer._id.toString() === socket.userId.toString()
            ? session.consultant._id
            : session.customer._id;
          
          this.io.to(`user_${receiverId}`).emit('typing:indicator', {
            sessionId,
            userId: socket.userId,
            userName: socket.userName,
            isTyping: true,
            timestamp: new Date()
          });

          // Auto-clear typing after 3 seconds
          const timeoutKey = `${sessionId}_${socket.userId}`;
          if (this.typingTimeouts.has(timeoutKey)) {
            clearTimeout(this.typingTimeouts.get(timeoutKey));
          }

          const timeout = setTimeout(() => {
            this.clearTypingIndicator(sessionId, socket.userId);
            this.typingTimeouts.delete(timeoutKey);
          }, 3000);

          this.typingTimeouts.set(timeoutKey, timeout);
        }
      } catch (error) {
        console.error('Typing start error:', error);
      }
    });

    socket.on('typing:stop', (data) => {
      const { sessionId } = data;
      this.clearTypingIndicator(sessionId, socket.userId);
    });

    // Message read receipts
    socket.on('messages:read', async (data) => {
      const { conversationId, messageIds } = data;
      
      try {
        // Update messages as read
        const result = await ChatMessage.updateMany(
          { 
            _id: { $in: messageIds },
            receiver: socket.userId,
            status: { $ne: 'read' }
          },
          { 
            status: 'read',
            readAt: new Date()
          }
        );

        if (result.modifiedCount > 0) {
          // Get sender IDs for read receipt
          const messages = await ChatMessage.find({ _id: { $in: messageIds } })
            .select('sender');
          const senderIds = [...new Set(messages.map(m => m.sender.toString()))];

          // Emit read receipts to senders
          senderIds.forEach(senderId => {
            this.io.to(`user_${senderId}`).emit('messages:read_receipt', {
              conversationId,
              readBy: socket.userId,
              readAt: new Date(),
              messageIds: messageIds
            });
          });
        }

      } catch (error) {
        console.error('Mark messages read error:', error);
      }
    });
  }

  /**
   * Set up session-related socket events
   */
  setupSessionEvents = (socket) => {
    // Join session room
    socket.on('session:join', (data) => {
      const { sessionId } = data;
      socket.join(`session_${sessionId}`);
      this.userSessions.set(socket.userId, sessionId);
      
      console.log(`${socket.userName} joined session: ${sessionId}`);
    });

    // Leave session room
    socket.on('session:leave', (data) => {
      const { sessionId } = data;
      socket.leave(`session_${sessionId}`);
      this.userSessions.delete(socket.userId);
      
      // Clear any typing indicators
      this.clearTypingIndicator(sessionId, socket.userId);
      
      console.log(`${socket.userName} left session: ${sessionId}`);
    });

    // Session status updates
    socket.on('session:status_update', async (data) => {
      const { sessionId, status } = data;
      
      try {
        const session = await Session.findById(sessionId);
        if (session && this.isSessionParticipant(session, socket.userId)) {
          
          // Emit to all session participants
          this.io.to(`session_${sessionId}`).emit('session:status_changed', {
            sessionId,
            status,
            updatedBy: socket.userId,
            updatedAt: new Date()
          });
        }
      } catch (error) {
        console.error('Session status update error:', error);
      }
    });
  }

  /**
   * Set up billing-related socket events
   */
  setupBillingEvents = (socket) => {
    // Get billing status for active session
    socket.on('billing:get_status', (data) => {
      const { sessionId } = data;
      const billingStatus = billingService.getBillingStatus(sessionId);
      
      socket.emit('billing:status', {
        sessionId,
        isActive: !!billingStatus,
        status: billingStatus || null
      });
    });

    // Handle connection issues (pause billing)
    socket.on('connection:unstable', (data) => {
      const { sessionId } = data;
      if (sessionId) {
        billingService.pauseBilling(sessionId);
        console.log(`Billing paused for unstable connection: ${socket.userName}`);
      }
    });

    // Handle connection restored (resume billing)
    socket.on('connection:restored', (data) => {
      const { sessionId } = data;
      if (sessionId) {
        billingService.resumeBilling(sessionId);
        console.log(`Billing resumed after connection restored: ${socket.userName}`);
      }
    });
  }

  /**
   * Set up presence-related socket events
   */
  setupPresenceEvents = (socket) => {
    // User activity heartbeat
    socket.on('user:heartbeat', () => {
      socket.lastActivity = new Date();
      // Update user's last seen
      User.findByIdAndUpdate(socket.userId, { lastSeen: new Date() }).exec();
    });

    // Manual status updates
    socket.on('user:status_update', (data) => {
      const { status } = data;
      this.emitUserPresence(socket.userId, status);
    });
  }

  /**
   * Handle socket disconnection
   */
  handleDisconnection = (socket) => {
    console.log(`User disconnected: ${socket.userName} (${socket.userId})`);

    // Get user's active session
    const sessionId = this.userSessions.get(socket.userId);
    
    if (sessionId) {
      // Pause billing due to disconnection
      billingService.pauseBilling(sessionId);
      
      // Clear typing indicators
      this.clearTypingIndicator(sessionId, socket.userId);
      
      // Notify other participant about disconnection
      socket.to(`session_${sessionId}`).emit('participant:disconnected', {
        userId: socket.userId,
        userName: socket.userName,
        disconnectedAt: new Date(),
        message: `${socket.userName} disconnected. Billing paused.`
      });
    }

    // Remove from connected users
    this.connectedUsers.delete(socket.userId);
    this.userSessions.delete(socket.userId);

    // Emit user offline status
    this.emitUserPresence(socket.userId, 'offline');

    // Update last seen in database
    User.findByIdAndUpdate(socket.userId, { 
      lastSeen: new Date(),
      isOnline: false 
    }).exec();
  }

  /**
   * Utility Methods
   */

  // Check if user is participant in session
  isSessionParticipant = (session, userId) => {
    console.log("session",session);
    console.log("userId", userId);
    console.log(session.consultant.toString());
    return session.customer._id.toString() === userId || 
           session.consultant._id.toString() === userId;
  }

  // Clear typing indicator
  clearTypingIndicator = (sessionId, userId) => {
    const timeoutKey = `${sessionId}_${userId}`;
    if (this.typingTimeouts.has(timeoutKey)) {
      clearTimeout(this.typingTimeouts.get(timeoutKey));
      this.typingTimeouts.delete(timeoutKey);
    }

    // Find the session and emit typing stop
    Session.findById(sessionId).then(session => {
      if (session && this.isSessionParticipant(session, userId)) {
        const receiverId = session.customer._id.toString() === userId.toString()
          ? session.consultant._id 
          : session.customer._id;
        
        this.io.to(`user_${receiverId}`).emit('typing:indicator', {
          sessionId,
          userId,
          isTyping: false,
          timestamp: new Date()
        });
      }
    }).catch(console.error);
  }

  // Emit user presence to relevant users
  emitUserPresence = (userId, status) => {
    this.io.emit('user:presence', {
      userId,
      status,
      timestamp: new Date()
    });
  }

  // Send notification to specific user
  sendNotificationToUser = (userId, notification) => {
    this.io.to(`user_${userId}`).emit('notification', {
      ...notification,
      timestamp: new Date()
    });
  }

  // Send session notification to participants
  sendSessionNotification = (sessionId, notification) => {
    this.io.to(`session_${sessionId}`).emit('session:notification', {
      ...notification,
      timestamp: new Date()
    });
  }

  // Broadcast to all connected users
  broadcast = (event, data) => {
    this.io.emit(event, {
      ...data,
      timestamp: new Date()
    });
  }

  // Get connected users count
  getConnectedUsersCount = () => {
    return this.connectedUsers.size;
  }

  // Check if user is online
  isUserOnline = (userId) => {
    return this.connectedUsers.has(userId);
  }

  // Get user's socket
  getUserSocket = (userId) => {
    const socketId = this.connectedUsers.get(userId);
    return socketId ? this.io.sockets.sockets.get(socketId) : null;
  }
}

// Export singleton instance
const socketHandler = new SocketHandler();
export default socketHandler;