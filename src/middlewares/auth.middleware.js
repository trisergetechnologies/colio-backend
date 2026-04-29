import { verifyToken, extractToken } from '../utils/token.helper.js';
import User from '../models/User.js';

/**
 * Authentication middleware
 * Verifies JWT token and adds user info to request
 */
export const authMiddleware = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token = extractToken(authHeader);

    if (!token) {
      return res.status(200).json({
        success: false,
        message: 'Access token is required',
        data: null
      });
    }

    // Verify token
    const tokenResult = verifyToken(token);
    
    if (!tokenResult.isValid) {
      return res.status(200).json({
        success: false,
        message: tokenResult.expired ? 'Token expired' : 'Invalid token',
        data: null
      });
    }

    // Find user and verify active status (consultants in onboarding may be inactive)
    const user = await User.findById(tokenResult.payload.userId);

    const consultantAppStatus =
      user?.role === 'consultant'
        ? user.consultantProfile?.applicationStatus ?? 'approved'
        : null;
    const inactiveConsultantOnboarding =
      user?.role === 'consultant' &&
      ['pending_profile', 'pending_approval', 'rejected'].includes(
        consultantAppStatus
      );

    if (!user || (!user.isActive && !inactiveConsultantOnboarding)) {
      return res.status(200).json({
        success: false,
        message: 'User not found or inactive',
        data: null
      });
    }

    // Add user info to request
    req.user = {
      userId: user._id,
      role: user.role,
      isVerified: user.isVerified,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified
    };

    next();

  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed',
      data: null
    });
  }
};

/**
 * Optional authentication middleware
 * Adds user info if token is valid, but doesn't require authentication
 */
export const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractToken(authHeader);

    if (token) {
      const tokenResult = verifyToken(token);
      
      if (tokenResult.isValid) {
        const user = await User.findById(tokenResult.payload.userId);
        
        if (user && user.isActive) {
          req.user = {
            userId: user._id,
            role: user.role,
            isVerified: user.isVerified,
            isEmailVerified: user.isEmailVerified,
            isPhoneVerified: user.isPhoneVerified
          };
        }
      }
    }

    next();

  } catch (error) {
    // Continue without authentication for optional middleware
    next();
  }
};