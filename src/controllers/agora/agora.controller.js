// controllers/agora.controller.js
import agoraService from '../../services/agora.service.js';
import { generateNumericUid } from '../../utils/agoraTokenGenerator.js';

/**
 * Generate RTM token for chat
 */
export const generateRTMToken = async (req, res) => {
  try {
    const userId = req.user._id;
    const numericUid = generateNumericUid(userId);
    
    const tokenData = agoraService.generateRTMToken(numericUid);
    
    res.status(200).json({
      success: true,
      message: 'RTM token generated successfully',
      data: tokenData
    });
  } catch (error) {
    console.error('Generate RTM token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate RTM token',
      error: error.message
    });
  }
};

/**
 * Generate RTC token for voice/video calls
 */
export const generateRTCToken = async (req, res) => {
  try {
    const { channelName, role = 'publisher' } = req.body;
    const userId = req.user._id;
    
    if (!channelName) {
      return res.status(400).json({
        success: false,
        message: 'Channel name is required'
      });
    }
    
    const numericUid = generateNumericUid(userId);
    const tokenData = agoraService.generateRTCToken(channelName, numericUid, role);
    
    res.status(200).json({
      success: true,
      message: 'RTC token generated successfully',
      data: tokenData
    });
  } catch (error) {
    console.error('Generate RTC token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate RTC token',
      error: error.message
    });
  }
};

/**
 * Generate both RTM and RTC tokens for a session
 */
export const generateSessionTokens = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id;
    
    const numericUid = generateNumericUid(userId);
    const tokens = agoraService.generateSessionTokens(sessionId, numericUid);
    
    res.status(200).json({
      success: true,
      message: 'Session tokens generated successfully',
      data: tokens
    });
  } catch (error) {
    console.error('Generate session tokens error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate session tokens',
      error: error.message
    });
  }
};

/**
 * Refresh expired token
 */
export const refreshToken = async (req, res) => {
  try {
    const { tokenType, channelName } = req.body;
    const userId = req.user._id;
    const numericUid = generateNumericUid(userId);
    
    let tokenData;
    
    if (tokenType === 'rtm') {
      tokenData = agoraService.generateRTMToken(numericUid);
    } else if (tokenType === 'rtc' && channelName) {
      tokenData = agoraService.generateRTCToken(channelName, numericUid);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid token type or missing channel name'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: tokenData
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token',
      error: error.message
    });
  }
};