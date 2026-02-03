import crypto from "crypto";
import User from "../../models/User.js";
import WalletTransaction from "../../models/WalletTransaction.js";

export const razorpayWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];

  const expected = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (expected !== signature) {
    return res.status(401).send("Invalid signature");
  }

  const event = req.body.event;

  if (event === "payment.captured") {
    const payment = req.body.payload.payment.entity;

    const txn = await WalletTransaction.findOne({
      razorpayOrderId: payment.order_id,
    });

    if (!txn || txn.status === "PAID") return res.sendStatus(200);

    txn.status = "PAID";
    txn.razorpayPaymentId = payment.id;
    txn.webhookPayload = req.body;
    txn.creditedAt = new Date();

    const user = await User.findById(txn.user);
    if (user) {
      user.wallet.main += txn.walletCreditAmount;
      await user.save();
    }

    await txn.save();
  }

  res.sendStatus(200);
};
