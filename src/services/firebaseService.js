import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('../config/firebase-service-account.json');

// Initialize Firebase Admin SDK (only once)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'colio-website-test1',
  });
}

class FirebaseService {
  
  // Send notification to a single user
  async sendNotification(fcmToken, notification, data = {}) {
    if (!fcmToken) {
      throw new Error('FCM token is required');
    }

    const message = {
      token: fcmToken,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: {
        ...data,
        sentAt: new Date().toISOString(),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: data.channelId || 'default',
          color: '#8900ae',
          sound: 'default',
          priority: 'max',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    try {
      const response = await admin.messaging().send(message);
      console.log('✅ Notification sent successfully:', response);
      return { success: true, messageId: response };
    } catch (error) {
      console.error('❌ Error sending notification:', error);
      
      // Handle invalid token
      if (
        error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered'
      ) {
        return { success: false, invalidToken: true, error: error.message };
      }
      
      throw error;
    }
  }

  // Send notification to multiple users
  async sendMulticastNotification(fcmTokens, notification, data = {}) {
    if (!fcmTokens || fcmTokens.length === 0) {
      throw new Error('At least one FCM token is required');
    }

    const message = {
      tokens: fcmTokens,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: {
        ...data,
        sentAt: new Date().toISOString(),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: data.channelId || 'default',
          color: '#8900ae',
          sound: 'default',
        },
      },
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`✅ ${response.successCount} notifications sent successfully`);
      
      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
        responses: response.responses,
      };
    } catch (error) {
      console.error('❌ Error sending multicast notification:', error);
      throw error;
    }
  }

  // Send incoming call notification (high priority)
  async sendCallNotification(fcmToken, callData) {
    if (!fcmToken) {
      throw new Error('FCM token is required');
    }

    const message = {
      token: fcmToken,
      notification: {
        title: `📞 Incoming Call`,
        body: `${callData.callerName} is calling you...`,
      },
      data: {
        type: 'incoming_call',
        callId: callData.callId,
        callerId: callData.callerId,
        callerName: callData.callerName,
        callerPhoto: callData.callerPhoto || '',
        channelName: callData.channelName,
        agoraToken: callData.agoraToken,
        sentAt: new Date().toISOString(),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'incoming-call',
          color: '#d946ef',
          sound: 'default',
          priority: 'max',
          visibility: 'public',
          tag: callData.callId,
          sticky: true,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            category: 'INCOMING_CALL',
            'content-available': 1,
          },
        },
      },
    };

    try {
      const response = await admin.messaging().send(message);
      console.log('✅ Call notification sent:', response);
      return { success: true, messageId: response };
    } catch (error) {
      console.error('❌ Error sending call notification:', error);
      
      if (
        error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered'
      ) {
        return { success: false, invalidToken: true, error: error.message };
      }
      
      throw error;
    }
  }
}

export default new FirebaseService();