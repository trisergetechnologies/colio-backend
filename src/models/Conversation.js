// src/models/Conversation.js
import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    // Two participants in the conversation (customer & consultant)
    participants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }],

    // Unique key for fast lookup: sorted "userId1_userId2"
    participantKey: {
      type: String,
      unique: true,
      index: true
    },

    // Last message preview (for conversation list)
    lastMessage: {
      content: { type: String, default: null },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      messageType: {
        type: String,
        enum: ['text', 'emoji', 'call_log'],
        default: 'text'
      },
      createdAt: { type: Date, default: null }
    },

    // Unread count per user: { "userId": count }
    unreadCount: {
      type: Map,
      of: Number,
      default: new Map()
    },

    // Soft delete / archive
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// ============= INDEXES =============
conversationSchema.index({ participants: 1 });
conversationSchema.index({ updatedAt: -1 });
conversationSchema.index({ 'lastMessage.createdAt': -1 });

// ============= STATIC METHODS =============

/**
 * Generate participant key (sorted for consistency)
 * This ensures the same key regardless of order
 */
conversationSchema.statics.generateParticipantKey = function(userId1, userId2) {
  const sorted = [userId1.toString(), userId2.toString()].sort();
  return sorted.join('_');
};

/**
 * Find existing conversation or create new one
 * Used when starting a chat or creating call log message
 */
conversationSchema.statics.findOrCreateConversation = async function(userId1, userId2) {
  const participantKey = this.generateParticipantKey(userId1, userId2);

  let conversation = await this.findOne({ participantKey });

  if (!conversation) {
    conversation = await this.create({
      participants: [userId1, userId2],
      participantKey,
      unreadCount: new Map([
        [userId1.toString(), 0],
        [userId2.toString(), 0]
      ])
    });
  }

  return conversation;
};

// ============= INSTANCE METHODS =============

/**
 * Increment unread count for a specific user
 */
conversationSchema.methods.incrementUnread = function(userId) {
  const userIdStr = userId.toString();
  const currentCount = this.unreadCount.get(userIdStr) || 0;
  this.unreadCount.set(userIdStr, currentCount + 1);
};

/**
 * Reset unread count for a specific user (when they read messages)
 */
conversationSchema.methods.resetUnread = function(userId) {
  this.unreadCount.set(userId.toString(), 0);
};

/**
 * Update last message info
 */
conversationSchema.methods.updateLastMessage = function(content, senderId, messageType = 'text') {
  this.lastMessage = {
    content,
    sender: senderId,
    messageType,
    createdAt: new Date()
  };
};

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;