import CommunicationSession from "../../models/CommunicationSession.js";
import User from "../../models/User.js";

export const canContinueSession = async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user.userId;

  const session = await CommunicationSession.findById(sessionId);
  if (!session || session.status !== 'active' || !session.startedAt) {
    return res.json({ canContinue: false });
  }

  const customer = await User.findById(userId);

  const walletMain = customer.wallet.main || 0;
  const walletBonus = customer.wallet.bonus || 0;
  const totalBalance = walletMain + walletBonus;

  const now = new Date();
  const elapsedSeconds = Math.floor(
    (now - session.startedAt) / 1000
  );

  /* ======================================
     PREDICT FINAL BILL
  ====================================== */
  const billableMinutesIfEndedNow = Math.ceil(elapsedSeconds / 60);
  const alreadyBilledMinutes = session.billedMinutes || 0;

  const remainingMinutes =
    billableMinutesIfEndedNow - alreadyBilledMinutes;

  if (remainingMinutes <= 0) {
    return res.json({
      canContinue: true,
      remainingMinutes: 0,
      elapsedSeconds
    });
  }

  const requiredAmount = remainingMinutes * session.ratePerMinute;

  /* ======================================
     BONUS CAP PREDICTION (10%)
  ====================================== */
  const predictedTotalBill =
    session.billedAmount + requiredAmount;

  const maxBonusAllowed =
    Math.floor(predictedTotalBill * 0.10);

  const remainingBonusAllowed =
    Math.max(0, maxBonusAllowed - (session.bonusUsed || 0));

  const bonusUsableNow =
    Math.min(walletBonus, remainingBonusAllowed);

  const mainRequired =
    requiredAmount - bonusUsableNow;

  const canContinue =
    walletMain >= mainRequired;

  return res.json({
    canContinue,
    remainingMinutes,
    requiredAmount,
    bonusUsableNow,
    mainRequired,
    elapsedSeconds
  });
};