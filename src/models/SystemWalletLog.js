import mongoose from 'mongoose';

const systemWalletLogSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CommunicationSession',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  source: {
    type: String,
    enum: ['call_billing'],
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('SystemWalletLog', systemWalletLogSchema);
