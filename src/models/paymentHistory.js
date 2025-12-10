// models/PaymentHistory.ts
import mongoose from 'mongoose';

const paymentHistorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  amount: {
    type: Number,
    required: true
  },
  
  razorpayOrderId: {
    type: String,
    required: true
  },
  
  razorpayPaymentId: {
    type: String,
    default: null
  },
  
  status: {
    type: String,
    enum: ['pending', 'success', 'failed'],
    default: 'pending'
  },
  
  paymentMethod: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

export const PaymentHistory = mongoose.model('PaymentHistory', paymentHistorySchema);