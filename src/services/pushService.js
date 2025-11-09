// services/pushService.js
import admin from 'firebase-admin';
import dotenv from 'dotenv';
dotenv.config();

if (!admin.apps.length) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (sa) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(sa))
    });
  } else {
    // If no service account, admin will try default credentials (not recommended for production)
    try { admin.initializeApp(); } catch (e) { /* ignore */ }
  }
}

export async function sendPushToDevice(fcmToken, title, body, data = {}) {
  if (!fcmToken) return null;
  const msg = {
    token: fcmToken,
    notification: { title, body },
    data: { ...data }
  };
  return admin.messaging().send(msg);
}
