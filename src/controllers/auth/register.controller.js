// POST /api/auth/register              # registerUser()

import User from '../../models/User.js';
import settingsService from '../../services/settingsService.js';
import { hashPassword } from '../../utils/password.helper.js';
import { generateToken } from '../../utils/token.helper.js';
import { maskEmail, maskPhone } from '../../utils/mask.helper.js';

/**
 * Register new user
 * @route POST /api/auth/register
 * @desc Register user with email, phone, or Google OAuth
 * @access Public
 */
export const registerUser = async (req, res) => {
  try {
    const { 
      name, 
      email, 
      phone, 
      password, 
      role = 'customer',
      registrationType = 'email', // 'email', 'phone', 'google'
      googleId 
    } = req.body;

    // Input validation
    if (!name || name.trim().length < 2) {
      return res.status(200).json({
        success: false,
        message: 'Name must be at least 2 characters long',
        data: null
      });
    }

    if (!['customer', 'consultant'].includes(role)) {
      return res.status(200).json({
        success: false,
        message: 'Invalid role. Must be customer or consultant',
        data: null
      });
    }

    // Validate registration type specific requirements
    if (registrationType === 'email' && (!email || !password)) {
      return res.status(200).json({
        success: false,
        message: 'Email and password are required for email registration',
        data: null
      });
    }

    if (registrationType === 'phone' && (!phone || !password)) {
      return res.status(200).json({
        success: false,
        message: 'Phone and password are required for phone registration',
        data: null
      });
    }

    if (registrationType === 'google' && (!email || !googleId)) {
      return res.status(200).json({
        success: false,
        message: 'Email and Google ID are required for Google registration',
        data: null
      });
    }

    // Check for duplicate users
    const existingUserQuery = {};
    
    if (email) {
      existingUserQuery.$or = existingUserQuery.$or || [];
      existingUserQuery.$or.push({ email: email.toLowerCase() });
    }
    
    if (phone) {
      existingUserQuery.$or = existingUserQuery.$or || [];
      existingUserQuery.$or.push({ phone: phone });
    }

    if (googleId) {
      existingUserQuery.$or = existingUserQuery.$or || [];
      existingUserQuery.$or.push({ googleId: googleId });
    }

    const existingUser = await User.findOne(existingUserQuery);
    
    if (existingUser) {
      let conflictField = '';
      if (existingUser.email === email?.toLowerCase()) conflictField = 'email';
      else if (existingUser.phone === phone) conflictField = 'phone';
      else if (existingUser.googleId === googleId) conflictField = 'Google account';

      return res.status(200).json({
        success: false,
        message: `User with this ${conflictField} already exists`,
        data: null
      });
    }

    // Prepare user data
    const userData = {
      name: name.trim(),
      role,
      isActive: true,
      isVerified: false,
      isEmailVerified: false,
      isPhoneVerified: false
    };

    // Handle different registration types
    switch (registrationType) {
      case 'email':
        userData.email = email.toLowerCase();
        userData.phone = phone; // Optional for email registration
        userData.password = await hashPassword(password);
        break;
        
      case 'phone':
        userData.phone = phone;
        userData.email = email; // Optional for phone registration  
        userData.password = await hashPassword(password);
        break;
        
      case 'google':
        userData.email = email.toLowerCase();
        userData.phone = phone; // Will be verified later via OTP
        userData.googleId = googleId;
        userData.isEmailVerified = true; // Trust Google verification
        break;
    }

    // Initialize role-specific fields
    if (role === 'consultant') {
      const defaultRate = await settingsService.getSetting('financial.defaultConsultantRatePerMinute');
      userData.consultantProfile = {
        bio: '',
        skills: [],
        ratingAverage: 0,
        ratingCount: 0,
        totalSessions: 0,
        onboardingScore: 0,
        ratePerMinute: defaultRate,
        availabilityStatus: 'offWork',
        wallet: {
          available: 0,
          pending: 0,
          totalEarned: 0
        }
      };
    }

    // Initialize customer wallet
    userData.wallet = {
      main: 75,
      bonus: 0
    };

    // Add new user bonus for customers
    if (role === 'customer') {
      const newUserBonus = await settingsService.getSetting('business.newUserBonusAmount');
      userData.wallet.bonus = newUserBonus;
    }

    // Create user
    const user = await User.create(userData);

    // Generate JWT token for temporary access (until verification)
    const accessTokenExpiry = await settingsService.getSetting('auth.accessTokenExpiryMinutes');
    const token = generateToken(
      { 
        userId: user._id, 
        role: user.role,
        isVerified: user.isVerified 
      }, 
      `${accessTokenExpiry}m`
    );

    // Prepare response data (mask sensitive information)
    const responseData = {
      userId: user._id,
      name: user.name,
      role: user.role,
      isVerified: user.isVerified,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      registrationType,
      token
    };

    // Add masked contact information
    if (user.email) {
      responseData.email = maskEmail(user.email);
    }
    
    if (user.phone) {
      responseData.phone = maskPhone(user.phone);
    }

    // Add role-specific data
    if (role === 'customer') {
      responseData.wallet = user.wallet;
      responseData.referralCode = user.referralCode;
      responseData.bonusReceived = userData.wallet.bonus;
    }

    if (role === 'consultant') {
      responseData.consultantProfile = {
        ratePerMinute: user.consultantProfile.ratePerMinute,
        availabilityStatus: user.consultantProfile.availabilityStatus
      };
    }

    return res.status(200).json({
      success: true,
      message: `Registration successful! ${registrationType === 'google' ? 'Please verify your phone number.' : 'Please verify your email and phone number.'}`,
      data: responseData
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(200).json({
        success: false,
        message: errors.join(', '),
        data: null
      });
    }

    // Handle mongoose duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(200).json({
        success: false,
        message: `User with this ${field} already exists`,
        data: null
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.',
      data: null
    });
  }
};