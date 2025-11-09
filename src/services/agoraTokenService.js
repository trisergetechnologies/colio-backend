// // services/agoraTokenService.js
// import dotenv from 'dotenv';
// dotenv.config();

// // NOTE: pick the token builder library you installed. Many examples use 'agora-access-token' or 'agora-token'.
// // Adjust imports if the package name differs in your project.

// import AgoraToken from "agora-token";

// const {
//   RtcTokenBuilder,
//   RtcRole,
//   RtmTokenBuilder,
//   ChatTokenBuilder
// } = AgoraToken;

// const APP_ID = process.env.AGORA_APP_ID;
// const APP_CERT = process.env.AGORA_APP_CERTIFICATE;
// const TOKEN_TTL = parseInt(process.env.AGORA_TOKEN_TTL_SECONDS || '3600', 10);

// /**
//  * Build RTC token using account string if builder supports it.
//  * Falls back to numeric uid derived from account string if necessary.
//  */
// export function buildRtcTokenWithAccount(channelName, account, role = RtcRole.PUBLISHER, ttl = TOKEN_TTL) {
//   const expireTs = Math.floor(Date.now() / 1000) + ttl;

//   // Prefer buildTokenWithAccount if available
//   if (typeof RtcTokenBuilder.buildTokenWithAccount === 'function') {
//     return RtcTokenBuilder.buildTokenWithAccount(APP_ID, APP_CERT, channelName, account, role, expireTs);
//   }

//   // Fallback to numeric uid
//   if (typeof RtcTokenBuilder.buildTokenWithUid === 'function') {
//     const numericUid = accountToNumericId(account);
//     return RtcTokenBuilder.buildTokenWithUid(APP_ID, APP_CERT, channelName, numericUid, role, expireTs);
//   }

//   throw new Error('No compatible RTC token builder found in installed package');
// }

// /**
//  * Chat token for Agora Chat (AccessToken2)
//  */
// export function buildChatTokenForAccount(account, ttl = TOKEN_TTL) {
//   if (!ChatTokenBuilder || typeof ChatTokenBuilder.buildChatUserToken !== 'function') {
//     throw new Error('ChatTokenBuilder.buildChatUserToken not available - check your token library');
//   }
//   return ChatTokenBuilder.buildChatUserToken(APP_ID, APP_CERT, account.toString(), ttl);
// }

// /**
//  * Optional RTM token (if you use RTM)
//  */
// export function buildRtmToken(account, ttl = TOKEN_TTL) {
//   if (typeof RtmTokenBuilder.buildToken === 'function') {
//     // RtmTokenBuilder.buildToken(appId, appCert, account, role, expireTs)
//     const expireTs = Math.floor(Date.now() / 1000) + ttl;
//     return RtmTokenBuilder.buildToken(APP_ID, APP_CERT, account.toString(), /* role */ 1, expireTs);
//   }
//   return null;
// }

// /**
//  * deterministic numeric uid fallback
//  */
// function accountToNumericId(account) {
//   const s = account.toString();
//   const tail = s.slice(-10);
//   let num = 0;
//   for (let i = 0; i < tail.length; i++) {
//     num = (num << 5) - num + tail.charCodeAt(i);
//     num |= 0;
//   }
//   return Math.abs(num);
// }


import dotenv from 'dotenv';
dotenv.config();

// Import the latest agora-token package
import AgoraToken from 'agora-token';

const {
  RtcTokenBuilder,
  RtcRole,
  RtmTokenBuilder,
  ChatTokenBuilder,
} = AgoraToken;

const APP_ID = process.env.AGORA_APP_ID;
const APP_CERT = process.env.AGORA_APP_CERTIFICATE;
const TOKEN_TTL = parseInt(process.env.AGORA_TOKEN_TTL_SECONDS || '3600', 10);

/**
 * Build RTC token using user account string (Agora v3.2+)
 */
export function buildRtcTokenWithAccount(
  channelName,
  account,
  role = RtcRole.PUBLISHER,
  ttl = TOKEN_TTL
) {
  const expireTs = Math.floor(Date.now() / 1000) + ttl;

  // ✅ use latest method name
  if (typeof RtcTokenBuilder.buildTokenWithUserAccount === 'function') {
    return RtcTokenBuilder.buildTokenWithUserAccount(
      APP_ID,
      APP_CERT,
      channelName,
      account,
      role,
      expireTs
    );
  }

  // Fallback to numeric uid if account-based method unavailable
  if (typeof RtcTokenBuilder.buildTokenWithUid === 'function') {
    const numericUid = accountToNumericId(account);
    return RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERT,
      channelName,
      numericUid,
      role,
      expireTs
    );
  }

  throw new Error('No compatible RTC token builder found in agora-token package');
}

/**
 * Build Chat token (Agora Chat)
 */
export function buildChatTokenForAccount(account, ttl = TOKEN_TTL) {
  // ✅ Use the new standardized name
  if (!ChatTokenBuilder || typeof ChatTokenBuilder.buildUserToken !== 'function') {
    throw new Error('ChatTokenBuilder.buildUserToken not available - check agora-token version');
  }

  return ChatTokenBuilder.buildUserToken(APP_ID, APP_CERT, account.toString(), ttl);
}

/**
 * Optional RTM token (if you use RTM presence or messaging)
 */
export function buildRtmToken(account, ttl = TOKEN_TTL) {
  const expireTs = Math.floor(Date.now() / 1000) + ttl;

  if (typeof RtmTokenBuilder.buildToken === 'function') {
    return RtmTokenBuilder.buildToken(
      APP_ID,
      APP_CERT,
      account.toString(),
      /* role */ 1,
      expireTs
    );
  }
  return null;
}

/**
 * Deterministic numeric UID fallback (for RTC fallback)
 */
function accountToNumericId(account) {
  const s = account.toString();
  const tail = s.slice(-10);
  let num = 0;
  for (let i = 0; i < tail.length; i++) {
    num = (num << 5) - num + tail.charCodeAt(i);
    num |= 0;
  }
  return Math.abs(num);
}
