// routes/notificationRoutes.js
import express from 'express';
import User from '../../models/User.js';
import firebaseService from '../../services/firebaseService.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

const router = express.Router();


router.use(authMiddleware);

// Register/Update FCM Token (called after login)
router.post('/register-token', async (req, res) => {
  try {
    const { fcmToken, platform, deviceInfo } = req.body;
    const userId = req.user.userId; // From authenticateToken middleware

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required',
      });
    }

    // Update user with FCM token
    const user = await User.findByIdAndUpdate(
      userId,
      {
        fcmToken: fcmToken,
        'deviceInfo.platform': platform,
        'deviceInfo.version': deviceInfo?.version,
        'deviceInfo.lastUpdated': new Date(),
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    console.log(`✅ FCM token registered for user: ${user.name || user.phone}`);

    // Send welcome notification
    const welcomeResult = await firebaseService.sendWelcomeNotification(
      fcmToken,
      user.name
    );

    // If token is invalid, remove it
    if (welcomeResult.invalidToken) {
      await User.findByIdAndUpdate(userId, {
        $unset: { fcmToken: 1 },
      });
      console.log('🗑️ Removed invalid FCM token');
    }

    res.json({
      success: true,
      message: 'FCM token registered successfully',
      welcomeNotificationSent: welcomeResult.success,
    });
  } catch (error) {
    console.error('❌ Error registering FCM token:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// Remove FCM Token (called on logout)
router.post('/remove-token', async (req, res) => {
  try {
    const userId = req.user.userId;

    await User.findByIdAndUpdate(userId, {
      $unset: { fcmToken: 1 },
    });

    console.log(`🗑️ FCM token removed for user: ${userId}`);

    res.json({
      success: true,
      message: 'FCM token removed successfully',
    });
  } catch (error) {
    console.error('❌ Error removing FCM token:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// Send notification to specific user (for testing or admin use)
router.post('/send', async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;

    const user = await User.findById(userId);
    
    if (!user || !user.fcmToken) {
      return res.status(404).json({
        success: false,
        message: 'User not found or FCM token not registered',
      });
    }

    const result = await firebaseService.sendNotification(
      user.fcmToken,
      { title, body },
      data || {}
    );

    // If token is invalid, remove it
    if (result.invalidToken) {
      await User.findByIdAndUpdate(userId, {
        $unset: { fcmToken: 1 },
      });
    }

    res.json({
      success: result.success,
      message: result.success ? 'Notification sent successfully' : 'Failed to send notification',
      messageId: result.messageId,
    });
  } catch (error) {
    console.error('❌ Error sending notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification',
      error: error.message,
    });
  }
});

// Send call notification to expert (will be used later)
router.post('/send-call', async (req, res) => {
  try {
    const { expertId, callData } = req.body;

    const expert = await User.findById(expertId);
    
    if (!expert || !expert.fcmToken) {
      return res.status(404).json({
        success: false,
        message: 'Expert not found or FCM token not registered',
      });
    }

    const result = await firebaseService.sendCallNotification(
      expert.fcmToken,
      callData
    );

    // If token is invalid, remove it
    if (result.invalidToken) {
      await User.findByIdAndUpdate(expertId, {
        $unset: { fcmToken: 1 },
      });
    }

    res.json({
      success: result.success,
      message: result.success ? 'Call notification sent successfully' : 'Failed to send notification',
      messageId: result.messageId,
    });
  } catch (error) {
    console.error('❌ Error sending call notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send call notification',
      error: error.message,
    });
  }
});

// Test endpoint - Send test notification to yourself
router.post('/send-test', async (req, res) => {
  try {
    const { title, body } = req.body;
    const userId = req.user.userId;

    const user = await User.findById(userId);

    if (!user || !user.fcmToken) {
      return res.status(404).json({
        success: false,
        message: 'User not found or no FCM token registered',
      });
    }

    const result = await firebaseService.sendNotification(
      user.fcmToken,
      {
        title: title || 'Test Notification',
        body: body || 'This is a test notification from Colio',
      },
      {
        type: 'test',
        channelId: 'default',
      }
    );

    res.json({
      success: result.success,
      message: 'Test notification sent',
      messageId: result.messageId,
    });
  } catch (error) {
    console.error('❌ Error sending test notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification',
      error: error.message,
    });
  }
});

export default router;