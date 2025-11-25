// services/pushService.js (Backend)
import dotenv from 'dotenv';
dotenv.config();

import { Expo } from 'expo-server-sdk';

const expo = new Expo({
  useFcmV1: true // ✅ Use FCM v1 API
});

/**
 * Send push notification using FCM v1
 */
export async function sendPushToDevice(pushToken, title, body, data = {}) {
  try {
    if (!pushToken) {
      console.warn('No Expo push token provided');
      return null;
    }

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
      channelId: 'default',
    };

    console.log('Sending push notification:', { pushToken, title, body });

    const tickets = await expo.sendPushNotificationsAsync([message]);
    console.log('Push notification tickets:', tickets);

    // Check for errors
    const ticket = tickets[0];
    if (ticket.status === 'error') {
      console.error('Push notification error:', ticket.message);
      if (ticket.details) {
        console.error('Error details:', ticket.details);
      }
    }

    return ticket;
  } catch (error) {
    console.error('Error sending push notification:', error);
    throw error;
  }
}

/**
 * Send push to multiple devices
 */
export async function sendPushToMultipleDevices(tokens, title, body, data = {}) {
  try {
    const messages = tokens
      .filter(token => Expo.isExpoPushToken(token))
      .map(token => ({
        to: token,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
        channelId: 'default',
      }));

    if (messages.length === 0) {
      console.warn('No valid Expo push tokens provided');
      return [];
    }

    // Send in chunks of 100 (Expo's limit)
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];

    for (const chunk of chunks) {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    }

    return tickets;
  } catch (error) {
    console.error('Error sending push notifications:', error);
    throw error;
  }
}