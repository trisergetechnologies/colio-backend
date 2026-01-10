import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    // ============= BASIC INFORMATION =============
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters']
    },

  //   username: {
  //   type: String,
  //   required: true,
  //   unique: true,
  //   trim: true,
  //   lowercase: true,
  //   minlength: 3,
  //   maxlength: 30
  // },
    favoriteConsultants:{},
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
    },
    
    phone: {
      type: String,
      required: function () {
        return !this.googleId;   // ❗ only require phone if NOT Google user
      },
      trim: true,
      match: [/^[+]?[1-9]\d{1,14}$/, 'Please provide a valid phone number'],
      validate: {
        validator: function (v) {
          return !v || /^[0-9]{10}$/.test(v); // Validate only if phone exists
        },
        message: props => `${props.value} is not a valid phone number!`
      }
    },
    
    password: {
      type: String,
      required: function() {
        return !this.googleId;
      },
      minlength: [6, 'Password must be at least 6 characters'],
      select: false
    },

    // ============= ROLE & STATUS =============
    role: {
      type: String,
      enum: ['customer', 'consultant', 'admin'],
      required: true,
      default: 'customer'
    },
    favoriteConsultants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],

    isActive: {
      type: Boolean,
      default: true
    },
    
    isVerified: {
      type: Boolean,
      default: false
    },
    
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    
    isPhoneVerified: {
      type: Boolean,
      default: false
    },

    // ============= PROFILE INFORMATION =============
    avatar: {
      type: String,
      default: null
    },
    
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      default: null
    },
    
    dateOfBirth: {
      type: Date,
      validate: {
        validator: function(value) {
          return !value || value < new Date();
        },
        message: 'Date of birth must be in the past'
      }
    },
    
    languages: [{
      type: String,
      enum: ['english', 'hindi'],
      default: ['english']
    }],

    // ============= GOOGLE OAUTH =============
    googleId: {
      type: String,
      unique: true,
      sparse: true
    },

    // ============= CONSULTANT-SPECIFIC FIELDS =============
    consultantProfile: {
      bio: {
        type: String,
        maxlength: [500, 'Bio cannot exceed 500 characters'],
      },
      
      skills: [{
        type: String,
        enum: [
          'active-listening', 'empathy', 'stress-management', 
          'relationship-advice', 'career-guidance', 'general-chat',
          'anxiety-support', 'motivation', 'life-coaching'
        ]
      }],
      
      ratingAverage: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
      },
      
      ratingCount: {
        type: Number,
        default: 0,
        min: 0
      },
      
      totalSessions: {
        type: Number,
        default: 0,
        min: 0
      },
      
      onboardingScore: {
        type: Number,
        min: 0,
        max: 100,
        required: function() {
          return this.role === 'consultant';
        }
      },
      
      ratePerMinute: {
        type: Number,
        default: 15,
        min: 1,
        required: function() {
          return this.role === 'consultant';
        }
      },

      ratePerMinuteVideo: {
        type: Number,
        default: 25,
        min: 1,
        required: function() {
          return this.role === 'consultant';
        }
      },

      ratePerMinuteChat: {
        type: Number,
        default: 10,
        min: 1,
        required: function() {
          return this.role === 'consultant';
        }
      },
      
      availabilityStatus: {
        type: String,
        enum: ['onWork', 'offWork', 'busy'],
        default: 'offWork'
      },

      bankDetails: {
        accountHolderName: {
          type: String,
          trim: true
        },
        bankName: {
          type: String,
          trim: true
        },
        accountNumber: {
          type: String,
          trim: true
        },
        ifscCode: {
          type: String,
          trim: true,
          uppercase: true,
          match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code']
        },
        upiId: {
          type: String,
          trim: true,
          lowercase: true
        },
        isVerified: {
          type: Boolean,
          default: false
        },
        verifiedAt: {
          type: Date
        }
      },
      
      wallet: {
        available: {
          type: Number,
          default: 0,
          min: 0
        },
        pending: {
          type: Number,
          default: 0,
          min: 0
        },
        totalEarned: {
          type: Number,
          default: 0,
          min: 0
        }
      }
    },

    // ============= CUSTOMER WALLET =============
    wallet: {
      main: {
        type: Number,
        default: 0,
        min: 0
      },
      bonus: {
        type: Number,
        default: 0,
        min: 0
      }
    },

    // ============= KYC & COMPLIANCE =============
    kycVerified: {
      type: Boolean,
      default: false
    },
    
    documents: [{
      type: {
        type: String,
        enum: ['aadhaar', 'pan', 'passport', 'license'],
        required: true
      },
      url: {
        type: String,
        required: true
      },
      verified: {
        type: Boolean,
        default: false
      },
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }],

    // ============= REFERRAL SYSTEM =============
    referralCode: {
      type: String,
      unique: true,
      sparse: true
    },
    
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    
    totalReferrals: {
      type: Number,
      default: 0
    },

    fcmToken: {
      type: String,
      default: null
    },

    deviceInfo: {
      platform: {
        type: String,
        enum: ['ios', 'android', 'web'],
      },
      version: String,
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
    },
    notificationSettings: {
      enabled: {
        type: Boolean,
        default: true,
      },
      callNotifications: {
        type: Boolean,
        default: true,
      },
      messageNotifications: {
        type: Boolean,
        default: true,
      },
    },

    // ============= METADATA =============
    lastLogin: {
      type: Date
    },
    
    loginAttempts: {
      type: Number,
      default: 0
    },
    
    lockUntil: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// ============= INDEXES =============
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ googleId: 1 }, { sparse: true });
userSchema.index({ referralCode: 1 }, { sparse: true });
userSchema.index({ 'consultantProfile.availabilityStatus': 1 });
userSchema.index({ 'consultantProfile.skills': 1 });
userSchema.index({ 'consultantProfile.ratingAverage': -1 });
userSchema.index({ isActive: 1, isVerified: 1 });

// ============= VIRTUALS =============
userSchema.virtual('isAccountLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

userSchema.virtual('fullWalletBalance').get(function() {
  return this.wallet.main + this.wallet.bonus;
});

// ============= PRE-SAVE MIDDLEWARE =============
userSchema.pre('save', function(next) {
  if (this.isEmailVerified && this.isPhoneVerified) {
    this.isVerified = true;
  }
  next();
});

userSchema.pre('save', function(next) {
  if (this.isNew && !this.referralCode && this.role === 'customer') {
    this.referralCode = this.generateReferralCode();
  }
  next();
});

// ============= METHODS =============
userSchema.methods.generateReferralCode = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'TS';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

userSchema.methods.incLoginAttempts = async function() {
  const settingsService = (await import('../services/settingsService.js')).default;
  const maxAttempts = await settingsService.getSetting('auth.maxLoginAttempts');
  const lockTime = (await settingsService.getSetting('auth.accountLockoutMinutes')) * 60 * 1000;
  
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  if (this.loginAttempts + 1 >= maxAttempts && !this.lockUntil) {
    updates.$set = { lockUntil: Date.now() + lockTime };
  }
  
  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = async function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

userSchema.methods.updateFcmToken = async function(token) {
  this.fcmToken = token;
  return await this.save();
};

const User = mongoose.model('User', userSchema);
export default User;