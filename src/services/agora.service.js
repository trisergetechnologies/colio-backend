// services/agora.service.js
import pkg from 'agora-token';
const { RtcTokenBuilder, RtcRole, RtmTokenBuilder, RtmRole } = pkg;
import dotenv from 'dotenv';

dotenv.config();

class AgoraService {
  constructor() {
    this.appId = process.env.AGORA_APP_ID;
    this.appCertificate = process.env.AGORA_APP_CERTIFICATE;
    
    if (!this.appId || !this.appCertificate) {
      throw new Error('Agora App ID and Certificate are required');
    }
  }

  /**
   * Generate RTM token for chat messaging
   */
  generateRTMToken(userId, expirationInSeconds = 3600) {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationInSeconds;
    
    const token = RtmTokenBuilder.buildToken(
      this.appId,
      this.appCertificate,
      String(userId),
      RtmRole.Rtm_User,
      privilegeExpiredTs
    );
    
    return {
      token,
      appId: this.appId,
      userId: String(userId),
      expiresAt: new Date(privilegeExpiredTs * 1000)
    };
  }

  /**
   * Generate RTC token for voice/video calls
   */
  generateRTCToken(channelName, userId, role = 'publisher', expirationInSeconds = 3600) {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationInSeconds;
    
    // Determine role
    const rtcRole = role === 'publisher' 
      ? RtcRole.PUBLISHER 
      : RtcRole.SUBSCRIBER;
    
    // Generate token with UID
    const token = RtcTokenBuilder.buildTokenWithUid(
      this.appId,
      this.appCertificate,
      channelName,
      userId, // Using numeric UID
      rtcRole,
      privilegeExpiredTs
    );
    
    return {
      token,
      appId: this.appId,
      channelName,
      userId,
      role,
      expiresAt: new Date(privilegeExpiredTs * 1000)
    };
  }

  /**
   * Generate both RTM and RTC tokens for a session
   */
  generateSessionTokens(sessionId, userId, role = 'publisher') {
    const channelName = `session_${sessionId}`;
    
    return {
      rtm: this.generateRTMToken(userId),
      rtc: this.generateRTCToken(channelName, userId, role)
    };
  }

  /**
   * Generate unique channel name for calls
   */
  generateCallChannel(callId) {
    return `call_${callId}`;
  }

  /**
   * Generate conversation channel name
   */
  generateConversationChannel(customerId, consultantId) {
    // Sort IDs to ensure consistent channel name regardless of who initiates
    const sorted = [customerId, consultantId].sort();
    return `chat_${sorted[0]}_${sorted[1]}`;
  }
}

export default new AgoraService();