// models/CallLog.js
import mongoose from 'mongoose';

const callLogSchema = new mongoose.Schema({
  caller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
    index: true
  },
  
  callType: {
    type: String,
    enum: ['voice', 'video'],
    required: true
  },
  
  channelName: {
    type: String,
    required: true
  },
  
  status: {
    type: String,
    enum: ['initiated', 'ringing', 'answered', 'ended', 'missed', 'declined', 'failed'],
    default: 'initiated'
  },
  
  initiatedAt: {
    type: Date,
    default: Date.now
  },
  
  answeredAt: Date,
  endedAt: Date,
  
  duration: {
    type: Number, // in seconds
    default: 0
  },
  
  endReason: {
    type: String,
    enum: ['completed', 'declined', 'no_answer', 'busy', 'failed', 'cancelled', 'network_error'],
    default: null
  },
  
  recordingUrl: String,
  
  quality: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    issues: [String] // ['audio_problem', 'video_problem', 'connection_issue']
  }
}, {
  timestamps: true
});

// Indexes
callLogSchema.index({ initiatedAt: -1 });
callLogSchema.index({ caller: 1, initiatedAt: -1 });
callLogSchema.index({ receiver: 1, initiatedAt: -1 });

// Methods
callLogSchema.methods.calculateDuration = function() {
  if (this.answeredAt && this.endedAt) {
    this.duration = Math.floor((this.endedAt - this.answeredAt) / 1000);
  }
  return this.duration;
};

const CallLog = mongoose.model('CallLog', callLogSchema);
export default CallLog;