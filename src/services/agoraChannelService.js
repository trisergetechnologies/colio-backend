// services/agoraChannelService.js - FIXED
import axios from 'axios';

const AGORA_APP_ID = process.env.AGORA_APP_ID;
const AGORA_CUSTOMER_ID = process.env.AGORA_CUSTOMER_ID;
const AGORA_CUSTOMER_SECRET = process.env.AGORA_CUSTOMER_SECRET;

/**
 * Kicks all users from a channel by banning the channel name
 */
export async function kickAllFromChannel(channelName) {
  try {
    if (!AGORA_CUSTOMER_ID || !AGORA_CUSTOMER_SECRET) {
      console.error('❌ Agora REST API credentials not configured');
      return { success: false, error: 'credentials_missing' };
    }

    const credential = Buffer.from(`${AGORA_CUSTOMER_ID}:${AGORA_CUSTOMER_SECRET}`).toString('base64');

    // ✅ FIX: Remove uid field entirely when banning by channel name
    const response = await axios.post(
      'https://api.agora.io/dev/v1/kicking-rule',
      {
        appid: AGORA_APP_ID,
        cname: channelName,
        time: 1,
        privileges: ['join_channel']
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credential}`
        },
        timeout: 10000
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

export default { kickAllFromChannel };