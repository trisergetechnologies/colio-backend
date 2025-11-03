import jwt from 'jsonwebtoken';
import settingsService from '../services/settingsService.js';

/**
 * Generate JWT access token
 * @param {object} payload - Token payload (userId, role, etc.)
 * @param {string} expiresIn - Token expiry (e.g., '15m', '7d')
 * @returns {string} - JWT token
 */
export const generateToken = (payload, expiresIn) => {
  try {
    const secret = process.env.JWT_SECRET;
    
    if (!secret) {
      throw new Error('JWT_SECRET not found in environment variables');
    }

    const token = jwt.sign(payload, secret, {
      expiresIn: expiresIn || '15m',
      issuer: 'talksyne-api',
      audience: 'talksyne-app'
    });

    return token;
  } catch (error) {
    console.error('Token generation error:', error);
    throw new Error('Token generation failed');
  }
};

/**
 * Generate JWT refresh token
 * @param {object} payload - Token payload (userId, role)
 * @param {string} expiresIn - Token expiry (default from settings)
 * @returns {string} - JWT refresh token
 */
export const generateRefreshToken = async (payload, expiresIn) => {
  try {
    const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET not found in environment variables');
    }

    const defaultExpiry = await settingsService.getSetting('auth.refreshTokenExpiryDays');
    const expiry = expiresIn || `${defaultExpiry}d`;

    const token = jwt.sign(payload, secret, {
      expiresIn: expiry,
      issuer: 'talksyne-api',
      audience: 'talksyne-app'
    });

    return token;
  } catch (error) {
    console.error('Refresh token generation error:', error);
    throw new Error('Refresh token generation failed');
  }
};

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @param {boolean} isRefreshToken - Whether it's a refresh token
 * @returns {object} - Decoded token payload
 */
export const verifyToken = (token, isRefreshToken = false) => {
  try {
    const secret = isRefreshToken 
      ? (process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET)
      : process.env.JWT_SECRET;

    if (!secret) {
      throw new Error('JWT secret not found');
    }

    const decoded = jwt.verify(token, secret, {
      issuer: 'talksyne-api',
      audience: 'talksyne-app'
    });

    return {
      isValid: true,
      payload: decoded
    };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return {
        isValid: false,
        error: 'Token expired',
        expired: true
      };
    }

    if (error.name === 'JsonWebTokenError') {
      return {
        isValid: false,
        error: 'Invalid token',
        expired: false
      };
    }

    console.error('Token verification error:', error);
    return {
      isValid: false,
      error: 'Token verification failed',
      expired: false
    };
  }
};

/**
 * Generate access and refresh tokens
 * @param {object} user - User object from database
 * @returns {object} - Object with accessToken and refreshToken
 */
export const generateTokenPair = async (user) => {
  try {
    const payload = {
      userId: user._id,
      role: user.role,
      isVerified: user.isVerified
    };

    // Get token expiry from settings
    const accessTokenExpiry = await settingsService.getSetting('auth.accessTokenExpiryMinutes');
    const refreshTokenExpiry = await settingsService.getSetting('auth.refreshTokenExpiryDays');

    const accessToken = generateToken(payload, `${accessTokenExpiry}d`);
    const refreshToken = await generateRefreshToken(payload, `${refreshTokenExpiry}d`);

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTokenExpiry * 60 // Convert to seconds
    };
  } catch (error) {
    console.error('Token pair generation error:', error);
    throw new Error('Failed to generate token pair');
  }
};

/**
 * Extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} - Extracted token or null
 */
export const extractToken = (authHeader) => {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
};

/**
 * Generate password reset token
 * @param {string} userId - User ID
 * @returns {string} - Password reset token
 */
export const generatePasswordResetToken = (userId) => {
  try {
    const payload = {
      userId,
      type: 'password-reset'
    };

    // Password reset tokens expire in 1 hour
    const token = generateToken(payload, '1h');
    return token;
  } catch (error) {
    console.error('Password reset token generation error:', error);
    throw new Error('Failed to generate password reset token');
  }
};

/**
 * Verify password reset token
 * @param {string} token - Password reset token
 * @returns {object} - Verification result with userId if valid
 */
export const verifyPasswordResetToken = (token) => {
  try {
    const result = verifyToken(token);
    
    if (!result.isValid) {
      return result;
    }

    if (result.payload.type !== 'password-reset') {
      return {
        isValid: false,
        error: 'Invalid token type'
      };
    }

    return {
      isValid: true,
      userId: result.payload.userId
    };
  } catch (error) {
    console.error('Password reset token verification error:', error);
    return {
      isValid: false,
      error: 'Token verification failed'
    };
  }
};