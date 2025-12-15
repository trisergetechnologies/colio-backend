// src/utils/chatConstants.js

/**
 * Emojis available during video/voice calls
 * These are sent in real-time and displayed as floating animations
 * Used in: inCallController.js, Customer App call screen, Consultant App call screen
 */
export const CALL_EMOJIS = [
  '❤️',  // Love
  '👍',  // Thumbs up
  '😂',  // Laughing
  '🎉',  // Celebration
  '🔥',  // Fire
  '😍',  // Heart eyes
  '👋',  // Wave
  '🙏',  // Thank you / Namaste
  '😊',  // Smiling
  '💯'   // 100 / Perfect
];

/**
 * Message types supported in chat
 * Used in: Message model, chatController.js
 */
export const MESSAGE_TYPES = {
  TEXT: 'text',
  EMOJI: 'emoji',
  CALL_LOG: 'call_log'
};

/**
 * Call log statuses for chat messages
 * Used in: Message model callLogData.status, communicationController.js
 */
export const CALL_LOG_STATUS = {
  COMPLETED: 'completed',
  MISSED: 'missed',
  DECLINED: 'declined',
  BUSY: 'busy',
  NO_ANSWER: 'no_answer'
};

/**
 * Polling intervals (in milliseconds)
 * Used in: Mobile apps for real-time updates
 */
export const POLLING_INTERVALS = {
  CHAT_MESSAGES: 3000,      // 3 seconds for regular chat
  IN_CALL_MESSAGES: 2000,   // 2 seconds during active call
  IN_CALL_EMOJIS: 1000      // 1 second for emoji reactions (need faster updates)
};

/**
 * Emoji cleanup timeout (in milliseconds)
 * How long emojis stay in memory before being cleaned up
 * Used in: inCallController.js
 */
export const EMOJI_CLEANUP_TIMEOUT = 10000; // 10 seconds

/**
 * Pagination defaults
 * Used in: chatController.js
 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100
};

/**
 * Format call duration for display
 * Used when creating call log messages
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted as "M:SS" or "H:MM:SS"
 */
export const formatCallDuration = (seconds) => {
  if (!seconds || seconds <= 0) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Generate call log message content
 * Used in: communicationController.js when creating call_log messages
 * @param {string} callType - 'voice' or 'video'
 * @param {string} status - Call status (completed, missed, etc.)
 * @param {number} duration - Duration in seconds
 * @returns {string} Human-readable message
 */
export const generateCallLogContent = (callType, status, duration) => {
  const callTypeLabel = callType === 'video' ? 'Video call' : 'Voice call';
  
  switch (status) {
    case CALL_LOG_STATUS.COMPLETED:
      return `${callTypeLabel} · ${formatCallDuration(duration)}`;
    case CALL_LOG_STATUS.MISSED:
      return `Missed ${callType} call`;
    case CALL_LOG_STATUS.DECLINED:
      return `${callTypeLabel} declined`;
    case CALL_LOG_STATUS.BUSY:
      return `${callTypeLabel} · Busy`;
    case CALL_LOG_STATUS.NO_ANSWER:
      return `${callTypeLabel} · No answer`;
    default:
      return `${callTypeLabel}`;
  }
};

/**
 * Validate if emoji is allowed for calls
 * @param {string} emoji - Emoji to validate
 * @returns {boolean}
 */
export const isValidCallEmoji = (emoji) => {
  return CALL_EMOJIS.includes(emoji);
};

export default {
  CALL_EMOJIS,
  MESSAGE_TYPES,
  CALL_LOG_STATUS,
  POLLING_INTERVALS,
  EMOJI_CLEANUP_TIMEOUT,
  PAGINATION,
  formatCallDuration,
  generateCallLogContent,
  isValidCallEmoji
};