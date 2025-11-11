// services/pushService.js
import dotenv from 'dotenv';
dotenv.config();

import { Expo } from 'expo-server-sdk';

// Create a single Expo SDK client
const expo = new Expo();

/**
 * Send push notification to a single device (Expo token).
 * 
 * @param {string} pushToken - The Expo push token (e.g. ExponentPushToken[xxxxx])
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Extra payload data (optional)
 * @returns {Promise<object>} Expo ticket result
 */
export async function sendPushToDevice(pushToken, title, body, data = {}) {
  try {
    if (!pushToken) {
      console.warn('No Expo push token provided');
      return null;
    }

    // Verify valid token
    if (!Expo.isExpoPushToken(pushToken)) {
      console.warn(`Invalid Expo push token: ${pushToken}`);
      return null;
    }

    const message = {
      to: pushToken,
      sound: 'default',
      title: title || '',
      body: body || '',
      data: data || {},
      priority: 'high',
    };

    // Send message to Expo push service
    const receipts = await expo.sendPushNotificationsAsync([message]);
    console.log('Expo push receipts:', receipts);
    return receipts[0];
  } catch (error) {
    console.error('Error sending Expo push:', error);
    throw error;
  }
}
