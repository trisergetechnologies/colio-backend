// services/agoraTokenService.js
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
 * ✅ Build RTC token with UID (for auto-assign UID = 0)
 * This is what we need for the calling feature
 */
export function buildRtcTokenWithUid(
  channelName,
  uid = 0, // 0 means Agora will auto-assign a UID
  role = RtcRole.PUBLISHER,
  ttl = TOKEN_TTL
) {
  const expireTs = Math.floor(Date.now() / 1000) + ttl;

  console.log('🔑 Generating RTC token (UID-based):');
  console.log('   Channel:', channelName);
  console.log('   UID:', uid);
  console.log('   Role:', role);
  console.log('   Expire:', new Date(expireTs * 1000).toISOString());

  if (typeof RtcTokenBuilder.buildTokenWithUid !== 'function') {
    throw new Error('RtcTokenBuilder.buildTokenWithUid not available');
  }

  const token = RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERT,
    channelName,
    uid,
    role,
    expireTs
  );

  console.log('✅ Token generated (first 30 chars):', token.substring(0, 30));
  return token;
}

/**
 * Build RTC token using user account string (Agora v3.2+)
 * Keep this for other features if needed
 */
export function buildRtcTokenWithAccount(
  channelName,
  account,
  role = RtcRole.PUBLISHER,
  ttl = TOKEN_TTL
) {
  const expireTs = Math.floor(Date.now() / 1000) + ttl;

  console.log('🔑 Generating RTC token (Account-based):');
  console.log('   Channel:', channelName);
  console.log('   Account:', account);

  // Try account-based method first
  if (typeof RtcTokenBuilder.buildTokenWithUserAccount === 'function') {
    const token = RtcTokenBuilder.buildTokenWithUserAccount(
      APP_ID,
      APP_CERT,
      channelName,
      account,
      role,
      expireTs
    );
    console.log('✅ Account-based token generated');
    return token;
  }

  // Fallback to numeric uid
  if (typeof RtcTokenBuilder.buildTokenWithUid === 'function') {
    console.log('⚠️ Falling back to UID-based token');
    const numericUid = accountToNumericId(account);
    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERT,
      channelName,
      numericUid,
      role,
      expireTs
    );
    console.log('✅ UID-based token generated (UID:', numericUid, ')');
    return token;
  }

  throw new Error('No compatible RTC token builder found in agora-token package');
}

/**
 * Build Chat token (Agora Chat)
 */
export function buildChatTokenForAccount(account, ttl = TOKEN_TTL) {
  console.log('🔑 Generating Chat token for account:', account);

  // Use the new standardized name
  if (!ChatTokenBuilder || typeof ChatTokenBuilder.buildUserToken !== 'function') {
    throw new Error('ChatTokenBuilder.buildUserToken not available - check agora-token version');
  }

  const token = ChatTokenBuilder.buildUserToken(APP_ID, APP_CERT, account.toString(), ttl);
  console.log('✅ Chat token generated');
  return token;
}

/**
 * Optional RTM token (if you use RTM presence or messaging)
 */
export function buildRtmToken(account, ttl = TOKEN_TTL) {
  const expireTs = Math.floor(Date.now() / 1000) + ttl;

  console.log('🔑 Generating RTM token for account:', account);

  if (typeof RtmTokenBuilder.buildToken === 'function') {
    const token = RtmTokenBuilder.buildToken(
      APP_ID,
      APP_CERT,
      account.toString(),
      /* role */ 1,
      expireTs
    );
    console.log('✅ RTM token generated');
    return token;
  }
  
  console.warn('⚠️ RTM token builder not available');
  return null;
}

/**
 * Deterministic numeric UID fallback (for RTC fallback)
 * Converts a string account to a numeric UID
 */
function accountToNumericId(account) {
  const s = account.toString();
  const tail = s.slice(-10); // Use last 10 characters
  let num = 0;
  
  for (let i = 0; i < tail.length; i++) {
    num = (num << 5) - num + tail.charCodeAt(i);
    num |= 0; // Convert to 32-bit integer
  }
  
  return Math.abs(num);
}

// Validate configuration on module load
if (!APP_ID || !APP_CERT) {
  console.error('❌ AGORA_APP_ID or AGORA_APP_CERTIFICATE not set in environment variables');
} else {
  console.log('✅ Agora token service initialized');
  console.log('   App ID:', APP_ID);
  console.log('   Token TTL:', TOKEN_TTL, 'seconds');
}