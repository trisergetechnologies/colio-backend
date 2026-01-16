// services/agoraChannelService.js
import axios from 'axios';

const AGORA_APP_ID = process.env.AGORA_APP_ID;
const AGORA_CUSTOMER_ID = process.env.AGORA_CUSTOMER_ID;       // Get from Agora Console -> RESTful API
const AGORA_CUSTOMER_SECRET = process.env.AGORA_CUSTOMER_SECRET; // Get from Agora Console -> RESTful API

/**
 * Kicks all users from a channel by banning the channel name
 * This immediately disconnects both customer and consultant
 * 
 * @param {string} channelName - The Agora channel name
 * @returns {Promise<{success: boolean, ruleId?: number}>}
 */
export async function kickAllFromChannel(channelName) {
  try {
    if (!AGORA_CUSTOMER_ID || !AGORA_CUSTOMER_SECRET) {
      console.error('❌ Agora REST API credentials not configured');
      return { success: false, error: 'credentials_missing' };
    }

    // Create Base64 encoded credential
    const credential = Buffer.from(`${AGORA_CUSTOMER_ID}:${AGORA_CUSTOMER_SECRET}`).toString('base64');

    const response = await axios.post(
      'https://api.agora.io/dev/v1/kicking-rule',
      {
        appid: AGORA_APP_ID,
        cname: channelName,  // Ban by channel name - kicks everyone
        uid: 0,              // 0 means all users
        ip: '',
        time: 1,             // Ban for 1 minute (minimum) - channel won't be reused anyway
        privileges: ['join_channel']
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credential}`
        },
        timeout: 10000  // 10 second timeout
      }
    );

    console.log('✅ Agora kick rule created:', response.data);
    return { 
      success: true, 
      ruleId: response.data?.id 
    };

  } catch (error) {
    console.error('❌ Agora kick API error:', error.response?.data || error.message);
    return { 
      success: false, 
      error: error.response?.data?.message || error.message 
    };
  }
}

/**
 * Optional: Delete a kicking rule (if you want to reuse channel names)
 */
export async function deleteKickRule(ruleId) {
  try {
    const credential = Buffer.from(`${AGORA_CUSTOMER_ID}:${AGORA_CUSTOMER_SECRET}`).toString('base64');

    await axios.delete(
      `https://api.agora.io/dev/v1/kicking-rule?appid=${AGORA_APP_ID}&id=${ruleId}`,
      {
        headers: {
          'Authorization': `Basic ${credential}`
        }
      }
    );

    return { success: true };
  } catch (error) {
    console.error('❌ Agora delete rule error:', error.message);
    return { success: false };
  }
}

export default { kickAllFromChannel, deleteKickRule };