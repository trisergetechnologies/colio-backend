import mongoose from "mongoose";

const walletTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Cashfree identifiers
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    paymentSessionId: {
      type: String,
      required: true,
    },

    cfPaymentId: {
      type: String,
      default: null,
    },

    // Amounts
    grossAmount: {
      type: Number,
      required: true,
      min: 1,
    },

    walletCreditAmount: {
      type: Number,
      required: true, // 80%
    },

    platformFeeAmount: {
      type: Number,
      required: true, // 20%
    },

    currency: {
      type: String,
      default: "INR",
    },

    status: {
      type: String,
      enum: ["CREATED", "PAID", "FAILED", "CANCELLED"],
      default: "CREATED",
      index: true,
    },

    paymentMethod: {
      type: String,
      default: "cashfree",
    },

    webhookPayload: {
      type: Object,
      default: null,
    },

    creditedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("WalletTransaction", walletTransactionSchema);
