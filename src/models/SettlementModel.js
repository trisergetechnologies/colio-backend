import mongoose from 'mongoose';

const settlementSchema = new mongoose.Schema(
  {
    // ================= CORE REFERENCES =================
    consultant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // ================= AMOUNT DETAILS =================
    amount: {
      type: Number,
      required: true,
      min: 1
    },

    currency: {
      type: String,
      default: 'INR'
    },

    // ================= BANK SNAPSHOT =================
    bankSnapshot: {
      accountHolderName: {
        type: String,
        required: true
      },
      bankName: {
        type: String,
        required: true
      },
      accountNumber: {
        type: String,
        required: true
      },
      ifscCode: {
        type: String,
        required: true
      },
      upiId: {
        type: String
      }
    },

    // ================= SETTLEMENT STATUS =================
    status: {
      type: String,
      enum: ['pending', 'approved', 'settled', 'rejected'],
      default: 'pending',
      index: true
    },

    // ================= ADMIN ACTION =================
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    approvedAt: {
      type: Date
    },

    utr: {
      type: String,
      trim: true,
      uppercase: true
    },

    rejectionReason: {
      type: String,
      trim: true
    },

    // ================= METADATA =================
    generatedBy: {
      type: String,
      enum: ['cron', 'manual', 'system'],
      default: 'system'
    },

    settlementPeriod: {
      from: {
        type: Date
      },
      to: {
        type: Date
      }
    },

    remarks: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// ================= INDEXES =================
settlementSchema.index({ consultant: 1, status: 1 });
settlementSchema.index({ createdAt: -1 });
settlementSchema.index({ utr: 1 }, { sparse: true });

// ================= VALIDATIONS =================
settlementSchema.pre('save', function (next) {
  if (this.status === 'approved' || this.status === 'settled') {
    if (!this.utr) {
      return next(new Error('UTR is required for approval/settlement'));
    }
    if (!this.approvedBy || !this.approvedAt) {
      return next(new Error('Admin approval metadata missing'));
    }
  }

  if (this.status === 'rejected' && !this.rejectionReason) {
    return next(new Error('Rejection reason is required'));
  }

  next();
});

const Settlement = mongoose.model('Settlement', settlementSchema);
export default Settlement;
