import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
  {
    agoraMessageId: {
      type: String,
      sparse: true,
      index: true
    },

    // ============= MESSAGE IDENTIFICATION =============
    conversationId: {
      type: String,
      required: true,
      index: true
      // This uses the continuous conversationId (customer_consultant)
    },
    
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
      index: true
      // Links to the specific billing session
    },

    // ============= PARTICIPANTS =============
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // ============= MESSAGE CONTENT =============
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters']
    },
    
    messageType: {
      type: String,
      enum: ['text', 'image', 'file', 'system', 'call_initiated', 'call_ended'],
      default: 'text'
    },

    // ============= ATTACHMENTS =============
    attachments: [{
      filename: {
        type: String,
        required: true
      },
      originalName: String,
      mimetype: String,
      size: Number,
      url: {
        type: String,
        required: true
      }
    }],

    // ============= MESSAGE STATUS =============
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent'
    },
    
    sentAt: {
      type: Date,
      default: Date.now
    },
    
    deliveredAt: {
      type: Date
    },
    
    readAt: {
      type: Date
    },

    // ============= METADATA =============
    isEdited: {
      type: Boolean,
      default: false
    },
    
    editedAt: Date,
    
    isDeleted: {
      type: Boolean,
      default: false
    },
    
    deletedAt: Date,
    
    messageNumber: {
      type: Number
    }
  },
  {
    timestamps: true
  }
);

// ============= INDEXES =============
chatMessageSchema.index({ conversationId: 1, sentAt: -1 }); // All messages in conversation
chatMessageSchema.index({ sessionId: 1 }); // Messages in specific session
chatMessageSchema.index({ sender: 1 });
chatMessageSchema.index({ receiver: 1 });
chatMessageSchema.index({ status: 1 });
chatMessageSchema.index({ conversationId: 1, messageNumber: 1 });

// ============= STATIC METHODS =============
// UPDATED: Get full conversation history (across all sessions)
chatMessageSchema.statics.getConversationHistory = async function(conversationId, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  
  return await this.find({
    conversationId,
    isDeleted: false
  })
  .populate('sender', 'name avatar role')
  .populate('receiver', 'name avatar role')
  .populate('sessionId', 'sessionNumber startedAt') // Include session info
  .sort({ sentAt: -1 })
  .skip(skip)
  .limit(limit);
};

// NEW: Get messages for specific session only
chatMessageSchema.statics.getSessionMessages = async function(sessionId, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  
  return await this.find({
    sessionId,
    isDeleted: false
  })
  .populate('sender', 'name avatar role')
  .populate('receiver', 'name avatar role')
  .sort({ sentAt: -1 })
  .skip(skip)
  .limit(limit);
};

chatMessageSchema.statics.markMessagesAsRead = async function(conversationId, receiverId) {
  return await this.updateMany(
    {
      conversationId,
      receiver: receiverId,
      status: { $ne: 'read' }
    },
    {
      status: 'read',
      readAt: new Date()
    }
  );
};

chatMessageSchema.statics.getUnreadCount = async function(userId) {
  return await this.countDocuments({
    receiver: userId,
    status: { $ne: 'read' },
    isDeleted: false
  });
};

chatMessageSchema.statics.getNextMessageNumber = async function(conversationId) {
  const lastMessage = await this.findOne({ conversationId })
    .sort({ messageNumber: -1 });
  
  return lastMessage ? lastMessage.messageNumber + 1 : 1;
};

// ============= INSTANCE METHODS =============
chatMessageSchema.methods.markAsDelivered = async function() {
  if (this.status === 'sent') {
    this.status = 'delivered';
    this.deliveredAt = new Date();
    return await this.save();
  }
};

chatMessageSchema.methods.markAsRead = async function() {
  if (this.status !== 'read') {
    this.status = 'read';
    this.readAt = new Date();
    return await this.save();
  }
};

// ============= PRE-SAVE MIDDLEWARE =============
chatMessageSchema.pre('save', async function(next) {
  if (this.isNew && !this.messageNumber) {
    this.messageNumber = await this.constructor.getNextMessageNumber(this.conversationId);
  }
  next();
});

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
export default ChatMessage;