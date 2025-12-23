import CommunicationSession from '../../models/CommunicationSession.js';
import User from '../../models/User.js';

export const canContinueSession = async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user.userId;

  const session = await CommunicationSession.findById(sessionId);
  if (!session || session.status !== 'active') {
    return res.json({ canContinue: false });
  }

  const customer = await User.findById(userId);
  const rate = session.ratePerMinute;

  const totalBalance =
    (customer.wallet.main || 0) + (customer.wallet.bonus || 0);

  return res.json({
    canContinue: totalBalance >= rate
  });
};