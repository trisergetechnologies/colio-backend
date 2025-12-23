import express from 'express';
import firebaseService from '../../services/firebaseService.js';
import User from '../../models/User.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

const router = express.Router();



router.use(authMiddleware);

// Register/Update FCM Token (called after login)
router.post('/register-token', async (req, res) => {
  try {
    const { fcmToken, platform, deviceInfo } = req.body;
    const userId = req.user.userId; // from authenticateToken middleware

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
        'deviceInfo.brand': deviceInfo?.brand,
        'deviceInfo.modelName': deviceInfo?.modelName,
        'deviceInfo.osVersion': deviceInfo?.osVersion,
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
    const welcomeResult = await sendWelcomeNotification(user);

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

// Helper: Send Welcome Notification
async function sendWelcomeNotification(user) {
  if (!user.fcmToken) {
    return { success: false, reason: 'No FCM token' };
  }

  try {
    const result = await firebaseService.sendNotification(
      user.fcmToken,
      {
        title: '🎉 Welcome to Colio!',
        body: `Hi ${user.name || 'there'}! We're excited to help you connect with amazing people.`,
      },
      {
        type: 'welcome',
        userId: user._id.toString(),
        channelId: 'default',
      }
    );

    // If token is invalid, remove it
    if (result.invalidToken) {
      await User.findByIdAndUpdate(user._id, {
        $unset: { fcmToken: 1 },
      });
      console.log('🗑️ Removed invalid FCM token');
    }

    return result;
  } catch (error) {
    console.error('❌ Error sending welcome notification:', error);
    return { success: false, error: error.message };
  }
}

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

// Test endpoint - Send custom notification
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