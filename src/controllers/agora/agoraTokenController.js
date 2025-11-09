// controllers/agoraTokenController.js
import { buildChatTokenForAccount, buildRtcTokenWithAccount } from '../../services/agoraTokenService.js';

/**
 * GET /api/agora/chat/token
 * returns chat token for logged-in user
 */
export const getChatToken = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const token = buildChatTokenForAccount(userId);
    res.json({ ok: true, agoraAppId: process.env.AGORA_APP_ID, chatToken: token, userId });
  } catch (err) {
    console.error('getChatToken err', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * POST /api/agora/rtc/token
 * Body: { channelName }
 * Returns rtc token for logged-in user for specified channel
 */
export const getRtcTokenGeneric = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { channelName } = req.body;
    if (!channelName) return res.status(400).json({ error: 'channelName required' });

    const rtcToken = buildRtcTokenWithAccount(channelName, userId);
    res.json({ ok: true, agoraAppId: process.env.AGORA_APP_ID, rtcToken, userId });
  } catch (err) {
    console.error('getRtcTokenGeneric err', err);
    res.status(500).json({ error: 'Server error' });
  }
};
