import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    // ============= PARTICIPANTS =============
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    
    consultant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // ============= SESSION DETAILS =============
    type: {
      type: String,
      enum: ['chat'],
      default: 'chat',
      required: true
    },
    
    status: {
      type: String,
      enum: ['pending', 'ongoing', 'completed', 'cancelled', 'declined'],
      default: 'pending'
    },
    
    // ============= TIMING =============
    requestedAt: {
      type: Date,
      default: Date.now
    },
    
    startedAt: {
      type: Date
    },
    
    endedAt: {
      type: Date,
      validate: {
        validator: function(value) {
          return !value || !this.startedAt || value > this.startedAt;
        },
        message: 'End time must be after start time'
      }
    },
    
    durationMinutes: {
      type: Number,
      default: 0,
      min: 0
    },

    // ============= BILLING =============
    ratePerMinute: {
      type: Number,
      required: true,
      min: 1
    },
    
    totalCost: {
      type: Number,
      default: 0,
      min: 0
    },
    
    bonusUsed: {
      type: Number,
      default: 0,
      min: 0
    },
    
    mainWalletUsed: {
      type: Number,
      default: 0,
      min: 0
    },
    
    platformCommission: {
      type: Number,
      default: 0,
      min: 0
    },
    
    consultantEarning: {
      type: Number,
      default: 0,
      min: 0
    },

    // ============= COMMUNICATION (UPDATED) =============
    conversationId: {
      type: String,
      required: true,
      index: true
      // This will be: customer_consultant (continuous)
    },
    
    sessionNumber: {
      type: Number,
      required: true,
      index: true
      // Sequential number for this customer-consultant pair
    },
    
    lastMessageAt: {
      type: Date
    },
    
    messageCount: {
      type: Number,
      default: 0
    },

    // ============= FEEDBACK =============
    customerRating: {
      score: {
        type: Number,
        min: 1,
        max: 5
      },
      review: {
        type: String,
        maxlength: 500
      },
      ratedAt: Date
    },
    
    consultantRating: {
      score: {
        type: Number,
        min: 1,
        max: 5
      },
      review: {
        type: String,
        maxlength: 500
      },
      ratedAt: Date
    },

    // ============= METADATA =============
    endedBy: {
      type: String,
      enum: ['customer', 'consultant', 'system']
    },
    
    endReason: {
      type: String,
      enum: ['natural', 'timeout', 'insufficient_funds', 'technical_issue', 'disconnection']
    },
    
    lastActivity: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// ============= INDEXES =============
sessionSchema.index({ customer: 1, consultant: 1 });
sessionSchema.index({ status: 1 });
sessionSchema.index({ type: 1 });
sessionSchema.index({ requestedAt: -1 });
sessionSchema.index({ conversationId: 1 }); // For chat history
sessionSchema.index({ conversationId: 1, sessionNumber: 1 }); // For session order
sessionSchema.index({ lastActivity: -1 });

// ============= VIRTUAL FIELDS =============
sessionSchema.virtual('isActive').get(function() {
  return ['pending', 'ongoing'].includes(this.status);
});

sessionSchema.virtual('canBeRated').get(function() {
  return this.status === 'completed' && !this.customerRating.ratedAt;
});

// ============= INSTANCE METHODS =============
sessionSchema.methods.calculateDuration = function() {
  if (this.startedAt && this.endedAt) {
    this.durationMinutes = Math.ceil((this.endedAt - this.startedAt) / (1000 * 60));
  }
  return this.durationMinutes;
};

// UPDATED: Continuous conversation ID (no timestamp)
sessionSchema.methods.generateConversationId = function() {
  return `${this.customer}_${this.consultant}`;
};

// NEW: Get next session number for this customer-consultant pair
sessionSchema.statics.getNextSessionNumber = async function(conversationId) {
  const lastSession = await this.findOne({ conversationId })
    .sort({ sessionNumber: -1 });
  
  return lastSession ? lastSession.sessionNumber + 1 : 1;
};

sessionSchema.methods.updateLastActivity = async function() {
  this.lastActivity = new Date();
  return await this.save();
};

// ============= PRE-SAVE MIDDLEWARE (UPDATED) =============
sessionSchema.pre('save', async function(next) {
  if (this.isNew) {
    if (!this.conversationId) {
      this.conversationId = this.generateConversationId();
    }
    if (!this.sessionNumber) {
      this.sessionNumber = await this.constructor.getNextSessionNumber(this.conversationId);
    }
  }
  next();
});

const Session = mongoose.model('Session', sessionSchema);
export default Session;