import mongoose from 'mongoose';

const systemWalletSchema = new mongoose.Schema({
  balance: {
    type: Number,
    default: 0,
    min: 0
  }
}, { timestamps: true });

export default mongoose.model('SystemWallet', systemWalletSchema);