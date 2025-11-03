import Settings from '../models/Setting.js';

class SettingsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
  }

  /**
   * Get settings with caching
   * @param {string} environment - Environment (development, staging, production)
   * @returns {Promise<Object>} Settings object
   */
  async getSettings(environment = process.env.NODE_ENV || 'development') {
    const cacheKey = `settings_${environment}`;
    const cached = this.cache.get(cacheKey);

    // Return cached settings if valid
    if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
      return cached.settings;
    }

    try {
      // Fetch fresh settings from database
      let settings = await Settings.findOne({ 'metadata.environment': environment });
      
      // Create default settings if not exists
      if (!settings) {
        settings = await this.createDefaultSettings(environment);
      }
      
      // Cache the settings
      this.cache.set(cacheKey, {
        settings,
        timestamp: Date.now()
      });

      return settings;
    } catch (error) {
      console.error('Error fetching settings:', error);
      // Return default settings on error
      return this.getDefaultSettings();
    }
  }

  /**
   * Get specific setting value using dot notation
   * @param {string} path - Setting path (e.g., 'financial.platformCommissionPercentage')
   * @param {string} environment - Environment
   * @returns {Promise<any>} Setting value
   */
  async getSetting(path, environment = process.env.NODE_ENV || 'development') {
    try {
      const settings = await this.getSettings(environment);
      return this.getNestedValue(settings, path);
    } catch (error) {
      console.error(`Error getting setting ${path}:`, error);
      
      // Return default values for common settings
      const defaults = this.getDefaultSettingValues();
      return this.getNestedValue(defaults, path);
    }
  }

  /**
   * Update settings and clear cache
   * @param {Object} updates - Settings updates
   * @param {string} adminId - Admin user ID
   * @param {string} environment - Environment
   * @returns {Promise<Object>} Updated settings
   */
  async updateSettings(updates, adminId, environment = process.env.NODE_ENV || 'development') {
    try {
      const settings = await Settings.findOneAndUpdate(
        { 'metadata.environment': environment },
        { 
          ...updates,
          'metadata.lastUpdatedBy': adminId,
          $inc: { 'metadata.version': 1 }
        },
        { new: true, upsert: true }
      );
      
      // Clear cache for this environment
      const cacheKey = `settings_${environment}`;
      this.cache.delete(cacheKey);
      
      return settings;
    } catch (error) {
      console.error('Error updating settings:', error);
      throw new Error('Failed to update settings');
    }
  }

  /**
   * Clear all cached settings
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get financial settings (commonly used)
   * @param {string} environment 
   * @returns {Promise<Object>} Financial settings
   */
  async getFinancialSettings(environment = process.env.NODE_ENV || 'development') {
    const settings = await this.getSettings(environment);
    return settings.financial || this.getDefaultSettings().financial;
  }

  /**
   * Get auth settings (commonly used)
   * @param {string} environment 
   * @returns {Promise<Object>} Auth settings
   */
  async getAuthSettings(environment = process.env.NODE_ENV || 'development') {
    const settings = await this.getSettings(environment);
    return settings.auth || this.getDefaultSettings().auth;
  }

  /**
   * Check if feature is enabled
   * @param {string} featureName - Feature name from features object
   * @param {string} environment 
   * @returns {Promise<boolean>} True if feature is enabled
   */
  async isFeatureEnabled(featureName, environment = process.env.NODE_ENV || 'development') {
    const settings = await this.getSettings(environment);
    return settings.features?.[featureName] || false;
  }

  /**
   * Calculate platform commission
   * @param {number} totalAmount - Total session amount
   * @param {string} environment 
   * @returns {Promise<Object>} { platformEarning, consultantEarning }
   */
  async calculateCommission(totalAmount, environment = process.env.NODE_ENV || 'development') {
    const commissionPercentage = await this.getSetting('financial.platformCommissionPercentage', environment) || 40;
    
    const platformEarning = Math.round((totalAmount * commissionPercentage) / 100);
    const consultantEarning = totalAmount - platformEarning;

    return {
      platformEarning,
      consultantEarning,
      commissionPercentage
    };
  }

  /**
   * Get nested value from object using dot notation
   * @param {Object} obj - Object to search in
   * @param {string} path - Dot notation path
   * @returns {any} Value or undefined
   */
  getNestedValue(obj, path) {
    try {
      const keys = path.split('.');
      let value = obj;
      
      for (const key of keys) {
        value = value?.[key];
        if (value === undefined) return undefined;
      }
      
      return value;
    } catch (error) {
      console.error('Error getting nested value:', error);
      return undefined;
    }
  }

  /**
   * Create default settings for environment
   * @param {string} environment 
   * @returns {Promise<Object>} Created settings
   */
  async createDefaultSettings(environment) {
    try {
      const defaultSettings = this.getDefaultSettings();
      defaultSettings.metadata.environment = environment;
      
      const settings = await Settings.create(defaultSettings);
      return settings;
    } catch (error) {
      console.error('Error creating default settings:', error);
      return this.getDefaultSettings();
    }
  }

  /**
   * Get default settings object
   * @returns {Object} Default settings
   */
  getDefaultSettings() {
    return {
      // Financial Settings
      financial: {
        platformCommissionPercentage: 40,
        bonusWalletLimitPercentage: 50,
        defaultConsultantRatePerMinute: 4,
        minimumWalletBalance: 10,
        billingUnit: 'minute',
        minimumBillableUnit: 1,
        autoChargeIntervalSeconds: 30
      },

      // Authentication Settings
      auth: {
        otpExpiryMinutes: 5,
        otpMaxAttempts: 3,
        accessTokenExpiryMinutes: 15,
        refreshTokenExpiryDays: 7,
        maxLoginAttempts: 5,
        accountLockoutMinutes: 30,
        bcryptSaltRounds: 12
      },

      // Session Settings
      session: {
        sessionTimeoutMinutes: 30,
        maxSessionDurationMinutes: 120,
        ratingWindowHours: 24,
        allowBackToBackSessions: true,
        minSessionBreakMinutes: 2
      },

      // Communication Settings
      communication: {
        chatHistoryRetentionDays: -1, // Forever
        maxFileUploadSizeMB: 10,
        supportedLanguages: ['english', 'hindi'],
        allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf']
      },

      // Business Logic Settings
      business: {
        newUserBonusAmount: 50,
        referralBonusAmount: 25,
        consultantOnboardingPassScore: 70,
        aiRecommendationQuestions: 5,
        maxFavoriteConsultants: 10
      },

      // Feature Toggles
      features: {
        enableVideoCall: false,
        enableAIRecommendation: true,
        enableReferralSystem: true,
        enableChatAttachments: true,
        enablePushNotifications: true,
        maintenanceMode: false
      },

      // Metadata
      metadata: {
        version: 1,
        environment: 'development',
        lastUpdatedBy: null
      }
    };
  }

  /**
   * Get default setting values for fallback
   * @returns {Object} Default values
   */
  getDefaultSettingValues() {
    return {
      financial: {
        platformCommissionPercentage: 40,
        defaultConsultantRatePerMinute: 4,
        bonusWalletLimitPercentage: 50
      },
      auth: {
        otpExpiryMinutes: 5,
        accessTokenExpiryMinutes: 15,
        refreshTokenExpiryDays: 7,
        maxLoginAttempts: 5,
        bcryptSaltRounds: 12
      },
      business: {
        newUserBonusAmount: 50,
        referralBonusAmount: 25
      }
    };
  }
}

// Export singleton instance
const settingsService = new SettingsService();
export default settingsService;