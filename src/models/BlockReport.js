import mongoose from 'mongoose';

const blockReportSchema = new mongoose.Schema(
  {
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    blockedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    reason: {
      type: String,
      required: true
    },

    description: {
      type: String,
      maxlength: 500
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

// Prevent duplicate blocks
blockReportSchema.index(
  { blockedBy: 1, blockedUser: 1 },
  { unique: true }
);

const BlockReport = mongoose.model('BlockReport', blockReportSchema);
export default BlockReport;
