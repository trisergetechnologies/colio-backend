// utils/agoraTokenGenerator.js
import crypto from 'crypto';

/**
 * Utility functions for Agora token generation
 * This is a helper file for additional token utilities
 */

/**
 * Generate numeric UID from MongoDB ObjectId
 */
export const generateNumericUid = (mongoId) => {
  // Convert ObjectId to a stable numeric ID for Agora
  // Agora requires 32-bit unsigned integer
  const hash = crypto.createHash('sha256').update(String(mongoId)).digest('hex');
  const numericId = parseInt(hash.substring(0, 8), 16) % 2147483647;
  return numericId || 1; // Ensure non-zero
};

/**
 * Validate token expiration
 */
export const isTokenExpired = (expiresAt) => {
  return new Date(expiresAt) < new Date();
};

/**
 * Calculate remaining token time in seconds
 */
export const getRemainingTokenTime = (expiresAt) => {
  const remaining = new Date(expiresAt) - new Date();
  return Math.max(0, Math.floor(remaining / 1000));
};

/**
 * Generate secure channel name
 */
export const generateSecureChannelName = () => {
  return crypto.randomBytes(16).toString('hex');
};

export default {
  generateNumericUid,
  isTokenExpired,
  getRemainingTokenTime,
  generateSecureChannelName
};