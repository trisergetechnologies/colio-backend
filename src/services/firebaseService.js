// services/firebaseService.js
import admin from 'firebase-admin';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

const initializeFirebase = async () => {
  if (firebaseInitialized) return;

  try {
    const serviceAccountPath = join(__dirname, '../config/firebase-service-account.json');
    const serviceAccountFile = await readFile(serviceAccountPath, 'utf8');
    const serviceAccount = JSON.parse(serviceAccountFile);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'colio-website-test1',
    });

    firebaseInitialized = true;
    console.log('✅ Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin:', error);
    throw error;
  }
};

// Initialize Firebase on module load
await initializeFirebase();

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
          defaultSound: true,
          defaultVibrateTimings: true,
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
          defaultSound: true,
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
    throw new Error("FCM token is required");
  }

  const message = {
    token: fcmToken,

    // ✅ KEEP notification for backward compatibility (older app versions)
    notification: {
      title: `📞 Incoming ${callData.callType || "Call"}`,
      body: `${callData.customerName} is calling you...`,
    },

    // ✅ PRIMARY CONTROL via data payload (new system)
    data: {
      type: "incoming_call",

      title: `Incoming ${callData.callType || "Call"}`,
      body: `${callData.customerName} is calling you...`,

      sessionId: callData.sessionId,
      callType: callData.callType,
      channelName: callData.channelName,

      customerId: callData.customerId,
      customerName: callData.customerName,
      customerAvatar: callData.customerAvatar || "",

      rtcToken: callData.rtcToken || "",

      ratePerMinute: String(callData.ratePerMinute || 0),
      estimatedMaxDurationSeconds: String(
        callData.estimatedMaxDurationSeconds || 0
      ),

      channelId: "incoming-call",

      sentAt: new Date().toISOString(),
    },

    android: {
      priority: "high",

      notification: {
        channelId: "incoming-call",

        priority: "max",

        visibility: "public",

        sound: "default",

        tag: callData.sessionId,
      },
    },

    apns: {
      payload: {
        aps: {
          sound: "default",
          contentAvailable: true,
        },
      },
    },
  };

  try {

    const response = await admin.messaging().send(message);

    console.log("✅ Call notification sent:", response);

    return { success: true };

  } catch (error) {

    if (
      error.code === "messaging/invalid-registration-token" ||
      error.code === "messaging/registration-token-not-registered"
    ) {
      return { success: false, invalidToken: true };
    }

    console.error(error);

    return { success: false };
  }
}

  // Send welcome notification
  async sendWelcomeNotification(fcmToken, userName) {
    return await this.sendNotification(
      fcmToken,
      {
        title: '🎉 Welcome to Colio!',
        body: `Hi ${userName || 'there'}! We're excited to help you connect with amazing people.`,
      },
      {
        type: 'welcome',
        channelId: 'default',
      }
    );
  }
}

export default new FirebaseService();