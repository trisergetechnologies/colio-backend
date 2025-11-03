// services/notification.service.js
import admin from 'firebase-admin';
import User from '../models/User.js';

class NotificationService {
  constructor() {
    // Initialize Firebase Admin if service account exists
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        this.fcm = admin.messaging();
        console.log('Firebase initialized successfully');
      } catch (error) {
        console.warn('Firebase initialization failed:', error.message);
        this.fcm = null;
      }
    }
  }

  /**
   * Send push notification for incoming call
   */
  async sendCallNotification(receiverId, callerInfo, callType = 'voice') {
    try {
      const receiver = await User.findById(receiverId);
      if (!receiver?.fcmToken) {
        console.log('No FCM token for receiver:', receiverId);
        return null;
      }

      const message = {
        token: receiver.fcmToken,
        notification: {
          title: `Incoming ${callType === 'video' ? 'Video' : 'Voice'} Call`,
          body: `${callerInfo.name} is calling...`
        },
        data: {
          type: 'incoming_call',
          callType,
          callerId: String(callerInfo.id),
          callerName: callerInfo.name,
          timestamp: String(Date.now())
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'call_channel',
            priority: 'max',
            vibrateTimingsMillis: [0, 500, 500, 500]
          }
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: `Incoming ${callType === 'video' ? 'Video' : 'Voice'} Call`,
                body: `${callerInfo.name} is calling...`
              },
              sound: 'ringtone.caf',
              badge: 1
            }
          }
        }
      };

      if (this.fcm) {
        const response = await this.fcm.send(message);
        return response;
      }
      return null;
    } catch (error) {
      console.error('Send call notification error:', error);
      throw error;
    }
  }

  /**
   * Send notification for new chat message
   */
  async sendMessageNotification(receiverId, senderInfo, messagePreview) {
    try {
      const receiver = await User.findById(receiverId);
      if (!receiver?.fcmToken) return null;

      const message = {
        token: receiver.fcmToken,
        notification: {
          title: senderInfo.name,
          body: messagePreview
        },
        data: {
          type: 'new_message',
          senderId: String(senderInfo.id),
          senderName: senderInfo.name,
          conversationId: senderInfo.conversationId,
          timestamp: String(Date.now())
        }
      };

      if (this.fcm) {
        return await this.fcm.send(message);
      }
      return null;
    } catch (error) {
      console.error('Send message notification error:', error);
      return null;
    }
  }

  /**
   * Send session request notification to consultant
   */
  async sendSessionRequestNotification(consultantId, customerInfo) {
    try {
      const consultant = await User.findById(consultantId);
      if (!consultant?.fcmToken) return null;

      const message = {
        token: consultant.fcmToken,
        notification: {
          title: 'New Session Request',
          body: `${customerInfo.name} wants to start a chat session`
        },
        data: {
          type: 'session_request',
          customerId: String(customerInfo.id),
          customerName: customerInfo.name,
          timestamp: String(Date.now())
        }
      };

      if (this.fcm) {
        return await this.fcm.send(message);
      }
      return null;
    } catch (error) {
      console.error('Send session request notification error:', error);
      return null;
    }
  }
}

export default new NotificationService();