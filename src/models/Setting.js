import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema(
  {
    // Financial Settings
    financial: {
      platformCommissionPercentage: {
        type: Number,
        default: 40,
        min: 0,
        max: 90,
        required: true
      },
      bonusWalletLimitPercentage: {
        type: Number,
        default: 50, // 50% of session cost can come from bonus wallet
        min: 0,
        max: 100,
        required: true
      },
      defaultConsultantRatePerMinute: {
        type: Number,
        default: 4,
        min: 1,
        required: true
      },
      minimumWalletBalance: {
        type: Number,
        default: 10,
        min: 0,
        required: true
      },
      billingUnit: {
        type: String,
        enum: ['minute', 'second'],
        default: 'minute',
        required: true
      },
      minimumBillableUnit: {
        type: Number,
        default: 1, // Even 30sec call = 1 minute charge
        min: 1,
        required: true
      },
      autoChargeIntervalSeconds: {
        type: Number,
        default: 30, // Deduct balance every 30 seconds during session
        min: 10,
        required: true
      }
    },

    // Real-time Billing Configuration
billingIntervalSeconds: {
  type: Number,
  default: 60, // Deduct money every 60 seconds
  min: 30,
  max: 120
},

billingMethod: {
  type: String,
  enum: ['per_minute_ceiling', 'per_second_precise'],
  default: 'per_minute_ceiling' // 4m3s = 5 minutes billed
},

sessionResumeWindowMinutes: {
  type: Number,
  default: 30, // Can resume session within 30 minutes
  min: 5,
  max: 180
},

connectionGraceSeconds: {
  type: Number,
  default: 30, // Don't bill during disconnection for 30 seconds
  min: 10,
  max: 120
},

lowBalanceWarningMinutes: {
  type: Number,
  default: 2, // Warn when 2 minutes of balance left
  min: 1,
  max: 10
},

minimumSessionDurationMinutes: {
  type: Number,
  default: 1, // Minimum billable duration
  min: 1,
  max: 5
},

autoEndOnInsufficientFunds: {
  type: Boolean,
  default: true // Auto-end session when balance runs out
},

billingNotificationIntervals: {
  type: [Number],
  default: [5, 2, 1], // Notify at 5, 2, 1 minutes remaining
  validate: {
    validator: function(v) {
      return Array.isArray(v) && v.length > 0;
    },
    message: 'At least one notification interval is required'
  }
},

    // Session Management Settings
    session: {
      sessionTimeoutMinutes: {
        type: Number,
        default: 30, // Auto-end inactive sessions after 30 mins
        min: 5,
        required: true
      },
      maxSessionDurationMinutes: {
        type: Number,
        default: 120, // Maximum 2 hours per session
        min: 30,
        required: true
      },
      ratingWindowHours: {
        type: Number,
        default: 24, // User can rate within 24 hours
        min: 1,
        required: true
      },
      allowBackToBackSessions: {
        type: Boolean,
        default: true // Same customer-consultant can have multiple sessions
      },
      minSessionBreakMinutes: {
        type: Number,
        default: 2, // Minimum break between sessions
        min: 0,
        required: true
      }
    },

    // Authentication & Security Settings
    auth: {
      otpExpiryMinutes: {
        type: Number,
        default: 5,
        min: 1,
        max: 30,
        required: true
      },
      otpMaxAttempts: {
        type: Number,
        default: 3,
        min: 1,
        max: 10,
        required: true
      },
      accessTokenExpiryMinutes: {
        type: Number,
        default: 15,
        min: 5,
        required: true
      },
      refreshTokenExpiryDays: {
        type: Number,
        default: 7,
        min: 1,
        required: true
      },
      maxLoginAttempts: {
        type: Number,
        default: 5,
        min: 3,
        required: true
      },
      accountLockoutMinutes: {
        type: Number,
        default: 30, // Lock account after max attempts for 30 mins
        min: 5,
        required: true
      }
    },

    // Communication Settings
    communication: {
      chatHistoryRetentionDays: {
        type: Number,
        default: -1, // -1 means forever
        required: true
      },
      callRecordingRetentionDays: {
        type: Number,
        default: 365, // 1 year
        min: 30,
        required: true
      },
      maxFileUploadSizeMB: {
        type: Number,
        default: 10,
        min: 1,
        max: 100,
        required: true
      },
      supportedLanguages: {
        type: [String],
        default: ['english', 'hindi'],
        required: true
      },
      allowedFileTypes: {
        type: [String],
        default: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'],
        required: true
      }
    },

    // Business Logic Settings
    business: {
      newUserBonusAmount: {
        type: Number,
        default: 50, // Free ₹50 for new users
        min: 0,
        required: true
      },
      referralBonusAmount: {
        type: Number,
        default: 25, // ₹25 for successful referrals
        min: 0,
        required: true
      },
      consultantOnboardingPassScore: {
        type: Number,
        default: 70, // Minimum 70% to pass consultant interview
        min: 50,
        max: 100,
        required: true
      },
      aiRecommendationQuestions: {
        type: Number,
        default: 5, // Number of questions in AI recommendation
        min: 3,
        max: 10,
        required: true
      },
      maxFavoriteConsultants: {
        type: Number,
        default: 10, // Max consultants a customer can favorite
        min: 3,
        required: true
      },
      consultantMinRating: {
        type: Number,
        default: 3.0, // Minimum rating to stay active
        min: 1,
        max: 5,
        required: true
      }
    },

    // Feature Toggles
    features: {
      enableVideoCall: {
        type: Boolean,
        default: false // Will be enabled later
      },
      enableAIRecommendation: {
        type: Boolean,
        default: true
      },
      enableReferralSystem: {
        type: Boolean,
        default: true
      },
      enableChatAttachments: {
        type: Boolean,
        default: true
      },
      enablePushNotifications: {
        type: Boolean,
        default: true
      },
      maintenanceMode: {
        type: Boolean,
        default: false
      },
      enableRegionalFiltering: {
        type: Boolean,
        default: false // Filter consultants by region
      }
    },

    // App Version & Updates
    app: {
      minimumAppVersion: {
        type: String,
        default: '1.0.0' // Force app update if below this version
      },
      latestAppVersion: {
        type: String,
        default: '1.0.0'
      },
      forceUpdateRequired: {
        type: Boolean,
        default: false
      },
      appStoreUrl: {
        android: {
          type: String,
          default: ''
        },
        ios: {
          type: String,
          default: ''
        }
      }
    },

    // Admin Metadata
    metadata: {
      lastUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // Admin who last updated settings
      },
      version: {
        type: Number,
        default: 1 // Increment on each update for change tracking
      },
      environment: {
        type: String,
        enum: ['development', 'staging', 'production'],
        default: 'development'
      }
    }
  },
  {
    timestamps: true
  }
);

// Ensure only one settings document exists (singleton pattern)
settingsSchema.index({ environment: 1 }, { unique: true });

// Static method to get settings (creates default if not exists)
settingsSchema.statics.getSettings = async function(environment = 'development') {
  let settings = await this.findOne({ 'metadata.environment': environment });
  
  if (!settings) {
    // Create default settings for the environment
    settings = await this.create({
      'metadata.environment': environment
    });
  }
  
  return settings;
};

// Static method to update settings
settingsSchema.statics.updateSettings = async function(updates, adminId, environment = 'development') {
  const settings = await this.findOneAndUpdate(
    { 'metadata.environment': environment },
    { 
      ...updates,
      'metadata.lastUpdatedBy': adminId,
      $inc: { 'metadata.version': 1 }
    },
    { new: true, upsert: true }
  );
  
  return settings;
};

// Method to get specific setting value with dot notation
settingsSchema.methods.getSetting = function(path) {
  const keys = path.split('.');
  let value = this;
  
  for (const key of keys) {
    value = value[key];
    if (value === undefined) return null;
  }
  
  return value;
};

const Settings = mongoose.model('Settings', settingsSchema);

export default Settings;