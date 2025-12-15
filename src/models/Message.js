// src/models/Message.js
import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    // Reference to conversation
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true
    },

    // Sender and receiver
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

    // Message content
    content: {
      type: String,
      required: true
    },

    // Message type
    messageType: {
      type: String,
      enum: ['text', 'emoji', 'call_log'],
      default: 'text'
    },

    // Call log data (when messageType is 'call_log')
    callLogData: {
      sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CommunicationSession'
      },
      callType: {
        type: String,
        enum: ['voice', 'video']
      },
      duration: {
        type: Number, // in seconds
        default: 0
      },
      status: {
        type: String,
        enum: ['missed', 'completed', 'declined', 'busy', 'no_answer']
      }
    },

    // In-call message tracking
    duringCall: {
      type: Boolean,
      default: false
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommunicationSession',
      default: null
    },

    // Message status
    deliveredAt: {
      type: Date,
      default: null
    },
    readAt: {
      type: Date,
      default: null
    },

    // Soft delete (for individual user)
    deletedFor: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  {
    timestamps: true
  }
);

// ============= INDEXES =============
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, readAt: 1 });
messageSchema.index({ sessionId: 1 }); // For fetching in-call messages

// ============= VIRTUALS =============

/**
 * Format call duration as MM:SS
 */
messageSchema.virtual('formattedDuration').get(function() {
  if (this.messageType !== 'call_log' || !this.callLogData?.duration) {
    return null;
  }
  const mins = Math.floor(this.callLogData.duration / 60);
  const secs = this.callLogData.duration % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
});

/**
 * Check if message is a call log
 */
messageSchema.virtual('isCallLog').get(function() {
  return this.messageType === 'call_log';
});

/**
 * Check if call was missed/declined
 */
messageSchema.virtual('isMissedCall').get(function() {
  if (this.messageType !== 'call_log') return false;
  const status = this.callLogData?.status;
  return ['missed', 'declined', 'busy', 'no_answer'].includes(status);
});

// Ensure virtuals are included in JSON/Object
messageSchema.set('toJSON', { virtuals: true });
messageSchema.set('toObject', { virtuals: true });

// ============= STATIC METHODS =============

/**
 * Get messages for a conversation (paginated, newest first for loading)
 */
messageSchema.statics.getConversationMessages = async function(
  conversationId,
  userId,
  page = 1,
  limit = 50
) {
  const skip = (page - 1) * limit;

  const messages = await this.find({
    conversationId,
    deletedFor: { $ne: userId }
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('sender', 'name avatar')
    .lean();

  // Reverse for chronological order in UI
  return messages.reverse();
};

/**
 * Get new messages since a timestamp (for polling)
 */
messageSchema.statics.getMessagesSince = async function(
  conversationId,
  userId,
  sinceTimestamp
) {
  return this.find({
    conversationId,
    createdAt: { $gt: new Date(sinceTimestamp) },
    deletedFor: { $ne: userId }
  })
    .sort({ createdAt: 1 })
    .populate('sender', 'name avatar')
    .lean();
};

/**
 * Get in-call messages for a session
 */
messageSchema.statics.getInCallMessages = async function(sessionId, sinceTimestamp = null) {
  const query = {
    sessionId,
    duringCall: true
  };

  if (sinceTimestamp) {
    query.createdAt = { $gt: new Date(sinceTimestamp) };
  }

  return this.find(query)
    .sort({ createdAt: 1 })
    .populate('sender', 'name avatar')
    .lean();
};

/**
 * Mark messages as read
 */
messageSchema.statics.markAsRead = async function(conversationId, userId) {
  return this.updateMany(
    {
      conversationId,
      receiver: userId,
      readAt: null
    },
    {
      readAt: new Date()
    }
  );
};

const Message = mongoose.model('Message', messageSchema);

export default Message;