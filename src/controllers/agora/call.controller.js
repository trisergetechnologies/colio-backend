// controllers/call.controller.js
import CallLog from '../../models/CallLog.js';
import Session from '../../models/Session.js';
import notificationService from '../../services/notification.service.js';
import agoraService from '../../services/agora.service.js';
import { generateNumericUid } from '../../utils/agoraTokenGenerator.js';

/**
 * Initiate a call
 */
export const initiateCall = async (req, res) => {
  try {
    const { sessionId, callType = 'voice' } = req.body;
    const callerId = req.user._id;
    
    // Get session
    const session = await Session.findById(sessionId)
      .populate('customer', 'name')
      .populate('consultant', 'name');
      
    if (!session || session.status !== 'ongoing') {
      return res.status(400).json({
        success: false,
        message: 'Invalid or inactive session'
      });
    }
    
    // Determine receiver
    const receiverId = session.customer._id.equals(callerId)
      ? session.consultant._id
      : session.customer._id;
      
    const callerInfo = session.customer._id.equals(callerId)
      ? session.customer
      : session.consultant;
      
    // Generate channel name for this call
    const channelName = agoraService.generateCallChannel(sessionId);
    
    // Create call log
    const callLog = await CallLog.create({
      caller: callerId,
      receiver: receiverId,
      sessionId,
      callType,
      channelName,
      status: 'initiated'
    });
    
    // Generate RTC token for caller
    const numericUid = generateNumericUid(callerId);
    const tokenData = agoraService.generateRTCToken(
      channelName,
      numericUid,
      'publisher'
    );
    
    // Send push notification to receiver
    await notificationService.sendCallNotification(
      receiverId,
      callerInfo,
      callType
    );
    
    res.status(200).json({
      success: true,
      message: 'Call initiated successfully',
      data: {
        callId: callLog._id,
        channelName,
        ...tokenData
      }
    });
  } catch (error) {
    console.error('Initiate call error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate call',
      error: error.message
    });
  }
};

/**
 * Answer a call
 */
export const answerCall = async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user._id;
    
    // Get call log
    const callLog = await CallLog.findById(callId);
    
    if (!callLog) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }
    
    if (!callLog.receiver.equals(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to answer this call'
      });
    }
    
    // Update call status
    callLog.status = 'answered';
    callLog.answeredAt = new Date();
    await callLog.save();
    
    // Generate RTC token for receiver
    const numericUid = generateNumericUid(userId);
    const tokenData = agoraService.generateRTCToken(
      callLog.channelName,
      numericUid,
      'publisher'
    );
    
    res.status(200).json({
      success: true,
      message: 'Call answered successfully',
      data: {
        callId: callLog._id,
        channelName: callLog.channelName,
        ...tokenData
      }
    });
  } catch (error) {
    console.error('Answer call error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to answer call',
      error: error.message
    });
  }
};

/**
 * End a call
 */
export const endCall = async (req, res) => {
  try {
    const { callId } = req.params;
    const { endReason = 'completed' } = req.body;
    const userId = req.user._id;
    
    // Get call log
    const callLog = await CallLog.findById(callId);
    
    if (!callLog) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }
    
    // Verify user is part of the call
    if (!callLog.caller.equals(userId) && !callLog.receiver.equals(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to end this call'
      });
    }
    
    // Update call log
    callLog.status = 'ended';
    callLog.endedAt = new Date();
    callLog.endReason = endReason;
    
    // Calculate duration if call was answered
    if (callLog.answeredAt) {
      callLog.duration = Math.floor(
        (callLog.endedAt - callLog.answeredAt) / 1000
      );
    }
    
    await callLog.save();
    
    res.status(200).json({
      success: true,
      message: 'Call ended successfully',
      data: {
        callId: callLog._id,
        duration: callLog.duration
      }
    });
  } catch (error) {
    console.error('End call error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end call',
      error: error.message
    });
  }
};

/**
 * Decline a call
 */
export const declineCall = async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user._id;
    
    const callLog = await CallLog.findById(callId);
    
    if (!callLog || !callLog.receiver.equals(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to decline this call'
      });
    }
    
    callLog.status = 'declined';
    callLog.endedAt = new Date();
    callLog.endReason = 'declined';
    await callLog.save();
    
    res.status(200).json({
      success: true,
      message: 'Call declined successfully'
    });
  } catch (error) {
    console.error('Decline call error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to decline call',
      error: error.message
    });
  }
};

/**
 * Get call history
 */
export const getCallHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    const calls = await CallLog.find({
      $or: [{ caller: userId }, { receiver: userId }]
    })
      .populate('caller', 'name avatar')
      .populate('receiver', 'name avatar')
      .sort({ initiatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    res.status(200).json({
      success: true,
      message: 'Call history fetched successfully',
      data: calls
    });
  } catch (error) {
    console.error('Get call history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call history',
      error: error.message
    });
  }
};