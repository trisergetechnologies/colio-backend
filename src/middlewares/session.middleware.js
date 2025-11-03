import Session from '../models/Session.js';

/**
 * Session participant middleware
 * Verifies user is participant in the session
 */
export const sessionParticipantMiddleware = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;

    if (!sessionId) {
      return res.status(200).json({
        success: false,
        message: 'Session ID is required',
        data: null
      });
    }

    // Find session
    const session = await Session.findById(sessionId);
    
    if (!session) {
      return res.status(200).json({
        success: false,
        message: 'Session not found',
        data: null
      });
    }

    // Check if user is participant
    const isCustomer = session.customer.toString() === userId.toString();
    const isConsultant = session.consultant.toString() === userId.toString();

    if (!isCustomer && !isConsultant) {
      return res.status(200).json({
        success: false,
        message: 'Access denied. You are not a participant in this session',
        data: null
      });
    }

    // Add session info to request
    req.session = session;
    req.userRole = isCustomer ? 'customer' : 'consultant';

    next();

  } catch (error) {
    console.error('Session participant middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Session verification failed',
      data: null
    });
  }
};

/**
 * Active session middleware
 * Ensures session is in active state (ongoing)
 */
export const activeSessionMiddleware = async (req, res, next) => {
  try {
    // Assumes sessionParticipantMiddleware ran first
    const session = req.session;

    if (!session) {
      return res.status(200).json({
        success: false,
        message: 'Session information not found',
        data: null
      });
    }

    if (session.status !== 'ongoing') {
      return res.status(200).json({
        success: false,
        message: `Action not allowed. Session status: ${session.status}`,
        data: null
      });
    }

    next();

  } catch (error) {
    console.error('Active session middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Session status verification failed',
      data: null
    });
  }
};