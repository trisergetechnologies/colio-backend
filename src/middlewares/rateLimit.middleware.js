import rateLimit from 'express-rate-limit';
import settingsService from '../services/settingsService.js';

/**
 * General API rate limiting
 */
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests, please try again later',
    data: null
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Strict rate limiting for auth endpoints
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 auth requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later',
    data: null
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * OTP rate limiting - stricter for Talk Syne
 */
export const otpRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // Limit each IP to 3 OTP requests per 5 minutes
  message: {
    success: false,
    message: 'Too many OTP requests, please wait before requesting again',
    data: null
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Message sending rate limiting - per user
 */
export const messageRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute per user
  message: {
    success: false,
    message: 'Too many messages, please slow down',
    data: null
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    // Rate limit per user, not per IP for Talk Syne
    if (req.user?.userId) {
      return `user:${req.user.userId}`;
    }
    // Use default IP handling which properly supports IPv6
    return rateLimit.defaultKeyGenerator(req, res);
  }
});

/**
 * File upload rate limiting
 */
export const uploadRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // 20 uploads per 10 minutes
  message: {
    success: false,
    message: 'Too many file uploads, please wait before uploading again',
    data: null
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    if (req.user?.userId) {
      return `user:${req.user.userId}`;
    }
    return rateLimit.defaultKeyGenerator(req, res);
  }
});

/**
 * Session start rate limiting - prevent spam session requests
 */
export const sessionStartRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 session starts per 5 minutes per user
  message: {
    success: false,
    message: 'Too many session requests, please wait before starting another session',
    data: null
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    if (req.user?.userId) {
      return `user:${req.user.userId}`;
    }
    return rateLimit.defaultKeyGenerator(req, res);
  }
});