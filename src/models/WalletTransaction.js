import mongoose from "mongoose";

const walletTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // System generated
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Razorpay identifiers
    razorpayOrderId: {
      type: String,
      index: true,
    },

    razorpayPaymentId: {
      type: String,
      index: true,
    },
    razorpayStatus: String,

    razorpaySignature: {
      type: String,
    },

    grossAmount: {
      type: Number,
      required: true,
      min: 1,
    },

    walletCreditAmount: {
      type: Number,
      required: true,
    },

    platformFeeAmount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "INR",
    },

status: {
  type: String,
  enum: ["CREATED", "AUTHORIZED", "CAPTURED", "FAILED"],
  default: "CREATED",
  index: true,
},

    paymentGateway: {
      type: String,
      default: "razorpay",
    },

    webhookPayload: {
      type: Object,
      default: null,
    },

    creditedAt: {
      type: Date,
      default: null,
    },

    billingInfo: {
      name: String,
      email: String,
      phone: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model("WalletTransaction", walletTransactionSchema);
