// models/CommunicationSession.js
import mongoose from 'mongoose';

const communicationSessionSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    consultant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    type: { type: String, enum: ['chat', 'voice', 'video'], required: true },
    status: { type: String, enum: ['initiated', 'ringing', 'active', 'ended', 'cancelled', 'failed'], default: 'initiated' },

    // Agora related
    agora: {
      channelName: { type: String, default: null },          // for voice/video
      chatConversationId: { type: String, default: null },   // optional, your conversation id
      customerAccount: { type: String, default: null },      // usually user._id.toString()
      consultantAccount: { type: String, default: null },
      rtcTokenCustomer: { type: String, default: null },
      rtcTokenConsultant: { type: String, default: null }
    },

    // times / billing
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    totalDurationSeconds: { type: Number, default: 0 },
    ratePerMinute: { type: Number, default: 0 },
    billedAmount: { type: Number, default: 0 },

    isBilled: { 
      type: Boolean, 
      default: false 
    },

    billedMinutes: {
      type: Number,
      default: 0
    },

    lastBilledAt: {
      type: Date,
      default: null
    },

    systemEarning: {
      type: Number,
      default: 0
    },

    consultantEarning: {
      type: Number,
      default: 0
    },
    
    bonusUsed: {
      type: Number,
      default: 0
    },

    endedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    autoEnded: { type: Boolean, default: false },

    deviceInfo: { type: Object, default: {} },
    networkQuality: { type: String, enum: ['good', 'poor', 'unknown'], default: 'unknown' }
  },
  { timestamps: true }
);

communicationSessionSchema.index({ customer: 1 });
communicationSessionSchema.index({ consultant: 1 });
communicationSessionSchema.index({ type: 1 });
communicationSessionSchema.index({ status: 1 });
communicationSessionSchema.index({ 'agora.channelName': 1 });

const CommunicationSession = mongoose.model('CommunicationSession', communicationSessionSchema);
export default CommunicationSession;
