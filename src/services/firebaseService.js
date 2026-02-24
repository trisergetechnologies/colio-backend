// services/firebaseService.js
import admin from 'firebase-admin';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let firebaseInitialized = false;

const initializeFirebase = async () => {
  if (firebaseInitialized) return;

  try {

    const serviceAccountPath = join(
      __dirname,
      '../config/firebase-service-account.json'
    );

    const serviceAccountFile = await readFile(
      serviceAccountPath,
      'utf8'
    );

    const serviceAccount = JSON.parse(serviceAccountFile);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'colio-website-test1',
    });

    firebaseInitialized = true;

    console.log('✅ Firebase Admin initialized');

  } catch (error) {

    console.error('❌ Firebase init error:', error);

    throw error;

  }
};

await initializeFirebase();

class FirebaseService {

  // ============================================================
  // GENERIC NOTIFICATION (unchanged, production safe)
  // ============================================================

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

        ttl: 60 * 1000,

        notification: {
          channelId: data.channelId || 'default',
          sound: 'default',
          priority: 'max',
          defaultSound: true,
          defaultVibrateTimings: true,
        },

      },

    };

    try {

      const response =
        await admin.messaging().send(message);

      return { success: true, messageId: response };

    } catch (error) {

      if (
        error.code ===
          'messaging/invalid-registration-token' ||
        error.code ===
          'messaging/registration-token-not-registered'
      ) {

        return {
          success: false,
          invalidToken: true,
        };

      }

      throw error;

    }

  }

  // ============================================================
  // INCOMING CALL NOTIFICATION (ENHANCED)
  // ============================================================

  async sendCallNotification(fcmToken, callData) {
    if (!fcmToken) {
      throw new Error("FCM token required");
    }

    const message = {
      token: fcmToken,
      
      // ✅ STRICTLY DATA ONLY. ALL VALUES MUST BE STRINGS.
      data: {
        type: "incoming_call",
        sessionId: String(callData.sessionId || ""),
        callType: String(callData.callType || ""),
        channelName: String(callData.channelName || ""),
        customerId: String(callData.customerId || ""),
        customerName: String(callData.customerName || "Customer"),
        customerAvatar: String(callData.customerAvatar || ""),
        rtcToken: String(callData.rtcToken || ""),
        ratePerMinute: String(callData.ratePerMinute || 0),
        estimatedMaxDurationSeconds: String(callData.estimatedMaxDurationSeconds || 0),
        // Pass title and body as data so the React Native frontend can use them
        title: `📞 Incoming ${callData.callType || "Call"}`,
        body: `${callData.customerName} is calling you`,
        sentAt: new Date().toISOString(),
      },

      android: {
        priority: "high",
        ttl: 30 * 1000, // auto expire delivery attempt in 30 sec
        // ❌ NO 'notification' object here!
      },

      apns: {
        headers: {
          "apns-priority": "10"
        },
        payload: {
          aps: {
            // Wakes up iOS React Native JS thread in the background
            "content-available": 1 
          },
        },
      },
    };

    try {
      const response = await admin.messaging().send(message);
      console.log("✅ Call notification sent:", callData.sessionId);
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

  // ============================================================
  // NEW: CALL CANCELLED NOTIFICATION
  // ============================================================

  async sendCallCancelledNotification(
    fcmToken,
    sessionId
  ) {

    if (!fcmToken) return;

    const message = {

      token: fcmToken,

      data: {

        type: "call_cancelled",

        // ✅ Cast sessionId strictly to String to ensure React Native matches it
        sessionId: String(sessionId),

        sentAt: new Date().toISOString(),

      },

      android: {

        priority: "high",

        ttl: 10 * 1000,

      },

      apns: {
        headers: {
          "apns-priority": "10"
        },
        payload: {

          aps: {
            
            // ✅ Fix for iOS: Must use exactly "content-available": 1 to wake background thread
            "content-available": 1,

          },

        },

      },

    };

    try {

      await admin.messaging().send(message);

      console.log(
        "✅ Call cancelled notification sent:",
        sessionId
      );

    } catch (error) {

      console.error(
        "call_cancelled send error:",
        error.message
      );

    }

  }

  // ============================================================
  // WELCOME NOTIFICATION (unchanged)
  // ============================================================

  async sendWelcomeNotification(
    fcmToken,
    userName
  ) {

    return await this.sendNotification(
      fcmToken,
      {
        title: '🎉 Welcome to Colio!',
        body:
          `Hi ${userName || 'there'}!`,
      },
      {
        type: 'welcome',
        channelId: 'default',
      }
    );

  }

}

export default new FirebaseService();