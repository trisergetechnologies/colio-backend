import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema(
  {
    identifier: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    
    otp: {
      type: String,
      required: true,
      length: 6
    },
    
    type: {
      type: String,
      enum: ['email', 'phone'],
      required: true
    },
    
    attempts: {
      type: Number,
      default: 0,
      max: 3
    },
    
    isUsed: {
      type: Boolean,
      default: false
    },
    
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 5 * 60 * 1000)
    }
  },
  {
    timestamps: true
  }
);

// ============= INDEXES =============
otpSchema.index({ identifier: 1, type: 1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ============= STATIC METHODS =============
otpSchema.statics.generateOTP = function() {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

otpSchema.statics.findValidOTP = async function(identifier, type, otpCode) {
  return await this.findOne({
    identifier,
    type,
    otp: otpCode,
    isUsed: false,
    expiresAt: { $gt: new Date() },
    attempts: { $lt: 3 }
  });
};

// ============= INSTANCE METHODS =============
otpSchema.methods.markAsUsed = async function() {
  this.isUsed = true;
  return await this.save();
};

otpSchema.methods.incrementAttempts = async function() {
  this.attempts += 1;
  return await this.save();
};

const OTP = mongoose.model('OTP', otpSchema);
export default OTP;