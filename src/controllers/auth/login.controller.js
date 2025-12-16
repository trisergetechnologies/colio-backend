// 2. POST /api/auth/login                 # loginUser()
// 3. POST /api/auth/refresh-token         # refreshToken()
// 4. POST /api/auth/logout                # logoutUser()
// 5. POST /api/auth/forgot-password       # forgotPassword()
// 6. POST /api/auth/reset-password        # resetPassword()
// 7. POST /api/auth/change-password       # changePassword()

import User from '../../models/User.js';
import settingsService from '../../services/settingsService.js';
import { comparePassword } from '../../utils/password.helper.js';
import { generateTokenPair, verifyToken, generatePasswordResetToken, verifyPasswordResetToken, extractToken } from '../../utils/token.helper.js';
import { maskEmail, maskPhone } from '../../utils/mask.helper.js';

/**
 * Login user
 * @route POST /api/auth/login
 * @desc Authenticate user and return tokens
 * @access Public
 */
export const loginUser = async (req, res) => {
  try {
    const { 
      identifier, // email or phone
      password,
      loginType = 'email', // 'email', 'phone', 'google'
      googleId, // for Google OAuth login
      role
    } = req.body;

    // Input validation based on login type
    if (loginType === 'google') {
      if (!identifier || !googleId) {
        return res.status(200).json({
          success: false,
          message: 'Email and Google ID are required for Google login',
          data: null
        });
      }
    } else {
      if (!identifier || !password) {
        return res.status(200).json({
          success: false,
          message: 'Email/phone and password are required',
          data: null
        });
      }
    }

    // Build query based on login type
    let userQuery = {};
    if (loginType === 'google') {
      userQuery = {
        $and: [
          { email: identifier.toLowerCase() },
          { googleId: googleId }
        ]
      };
    } else if (loginType === 'email') {
      userQuery.email = identifier.toLowerCase();
    } else if (loginType === 'phone') {
      userQuery.phone = identifier;
    } else {
      userQuery.$or = [
        { email: identifier.toLowerCase() },
        { phone: identifier }
      ];
    }

    // Find user (include password only for non-Google login)
    const user = await User.findOne(userQuery).select(loginType === 'google' ? '' : '+password');

    if (!user) {
      return res.status(200).json({
        success: false,
        message: loginType === 'google' ? 'Google account not found' : 'Invalid credentials',
        data: null
      });
    }

    if (user.role !== role) {
      return res.status(200).json({
        success: false,
        message: 'Invalid credentials',
        data: null
      });
    }
    
    // Check if account is locked (skip for Google login)
    if (loginType !== 'google' && user.isAccountLocked) {
      const lockTime = await settingsService.getSetting('auth.accountLockoutMinutes');
      return res.status(200).json({
        success: false,
        message: `Account is locked. Try again after ${lockTime} minutes.`,
        data: null
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(200).json({
        success: false,
        message: 'Account has been deactivated. Please contact support.',
        data: null
      });
    }

    // Verify password (skip for Google login)
    if (loginType !== 'google') {
      const isPasswordValid = await comparePassword(password, user.password);
      
      if (!isPasswordValid) {
        // Increment failed login attempts
        await user.incLoginAttempts();
        
        return res.status(200).json({
          success: false,
          message: 'Invalid credentials',
          data: null
        });
      }

      // Reset login attempts on successful login
      await user.resetLoginAttempts();
    }

    // Update last login time
    user.lastLogin = new Date();
    await user.save();

    // Generate token pair
    const tokens = await generateTokenPair(user);

    // Prepare response data (mask sensitive information)
    const responseData = {
      userId: user._id,
      name: user.name,
      role: user.role,
      isVerified: user.isVerified,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      avatar: user.avatar,
      loginType: loginType,
      ...tokens
    };

    // Add masked contact information
    if (user.email) {
      responseData.email = maskEmail(user.email);
    }
    
    if (user.phone) {
      responseData.phone = maskPhone(user.phone);
    }

    // Add role-specific data
    if (user.role === 'customer') {
      responseData.wallet = user.wallet;
      responseData.referralCode = user.referralCode;
    }

    if (user.role === 'consultant') {
      responseData.consultantProfile = {
        availabilityStatus: user.consultantProfile.availabilityStatus,
        ratePerMinute: user.consultantProfile.ratePerMinute,
        ratingAverage: user.consultantProfile.ratingAverage,
        totalSessions: user.consultantProfile.totalSessions
      };
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: responseData
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
      data: null
    });
  }
};

/**
 * Refresh access token
 * @route POST /api/auth/refresh-token
 * @desc Generate new access token using refresh token
 * @access Public
 */
export const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return res.status(200).json({
        success: false,
        message: 'Refresh token is required',
        data: null
      });
    }

    // Verify refresh token
    const tokenResult = verifyToken(token, true);
    
    if (!tokenResult.isValid) {
      return res.status(200).json({
        success: false,
        message: tokenResult.expired ? 'Refresh token expired' : 'Invalid refresh token',
        data: null
      });
    }

    // Find user
    const user = await User.findById(tokenResult.payload.userId);
    
    if (!user || !user.isActive) {
      return res.status(200).json({
        success: false,
        message: 'User not found or inactive',
        data: null
      });
    }

    // Generate new token pair
    const tokens = await generateTokenPair(user);

    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        userId: user._id,
        role: user.role,
        isVerified: user.isVerified,
        ...tokens
      }
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(500).json({
      success: false,
      message: 'Token refresh failed',
      data: null
    });
  }
};

/**
 * Logout user
 * @route POST /api/auth/logout
 * @desc Logout user (client-side token removal)
 * @access Private
 */
export const logoutUser = async (req, res) => {
  try {
    // In JWT-based auth, logout is mainly client-side
    // Server can optionally blacklist the token or update user record
    
    const userId = req.user?.userId;
    
    if (userId) {
      // Optional: Update last activity or logout time
      await User.findByIdAndUpdate(userId, {
        lastActivity: new Date()
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Logout successful',
      data: null
    });

  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      success: false,
      message: 'Logout failed',
      data: null
    });
  }
};

/**
 * Forgot password
 * @route POST /api/auth/forgot-password
 * @desc Send password reset token to user's email
 * @access Public
 */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(200).json({
        success: false,
        message: 'Email is required',
        data: null
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.status(200).json({
        success: true,
        message: 'If the email exists, a password reset link has been sent',
        data: null
      });
    }

    if (!user.isActive) {
      return res.status(200).json({
        success: false,
        message: 'Account is deactivated',
        data: null
      });
    }

    // Generate password reset token
    const resetToken = generatePasswordResetToken(user._id);

    // TODO: Send email with reset token
    // For now, return the token in response (development only)
    // In production, this should be sent via email service
    
    console.log(`Password reset token for ${email}: ${resetToken}`);

    return res.status(200).json({
      success: true,
      message: 'Password reset link has been sent to your email',
      data: {
        email: maskEmail(user.email),
        // Remove this in production:
        resetToken: resetToken
      }
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process password reset request',
      data: null
    });
  }
};

/**
 * Reset password
 * @route POST /api/auth/reset-password
 * @desc Reset password using reset token
 * @access Public
 */
export const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(200).json({
        success: false,
        message: 'Reset token and new password are required',
        data: null
      });
    }

    // Validate password strength
    if (newPassword.length < 6) {
      return res.status(200).json({
        success: false,
        message: 'Password must be at least 6 characters long',
        data: null
      });
    }

    // Verify reset token
    const tokenResult = verifyPasswordResetToken(resetToken);
    
    if (!tokenResult.isValid) {
      return res.status(200).json({
        success: false,
        message: 'Invalid or expired reset token',
        data: null
      });
    }

    // Find user
    const user = await User.findById(tokenResult.userId).select('+password');
    
    if (!user || !user.isActive) {
      return res.status(200).json({
        success: false,
        message: 'User not found or inactive',
        data: null
      });
    }

    // Hash and update password
    const { hashPassword } = await import('../../utils/password.helper.js');
    user.password = await hashPassword(newPassword);
    
    // Reset login attempts and unlock account
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password reset successful. Please login with your new password.',
      data: {
        email: maskEmail(user.email)
      }
    });

  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Password reset failed',
      data: null
    });
  }
};

/**
 * Change password
 * @route POST /api/auth/change-password
 * @desc Change password for authenticated user
 * @access Private (requires authentication)
 */
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId; // From auth middleware

    if (!currentPassword || !newPassword) {
      return res.status(200).json({
        success: false,
        message: 'Current password and new password are required',
        data: null
      });
    }

    // Validate new password strength
    if (newPassword.length < 6) {
      return res.status(200).json({
        success: false,
        message: 'New password must be at least 6 characters long',
        data: null
      });
    }

    // Find user with password
    const user = await User.findById(userId).select('+password');
    
    if (!user) {
      return res.status(200).json({
        success: false,
        message: 'User not found',
        data: null
      });
    }

    // For Google OAuth users, handle differently
    if (user.googleId && !user.password) {
      // Set password for Google users
      const { hashPassword } = await import('../../utils/password.helper.js');
      user.password = await hashPassword(newPassword);
      await user.save();

      return res.status(200).json({
        success: true,
        message: 'Password set successfully',
        data: null
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await comparePassword(currentPassword, user.password);
    
    if (!isCurrentPasswordValid) {
      return res.status(200).json({
        success: false,
        message: 'Current password is incorrect',
        data: null
      });
    }

    // Check if new password is different from current
    const isSamePassword = await comparePassword(newPassword, user.password);
    
    if (isSamePassword) {
      return res.status(200).json({
        success: false,
        message: 'New password must be different from current password',
        data: null
      });
    }

    // Hash and update new password
    const { hashPassword } = await import('../../utils/password.helper.js');
    user.password = await hashPassword(newPassword);
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully',
      data: null
    });

  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Password change failed',
      data: null
    });
  }
};