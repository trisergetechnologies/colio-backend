import crypto from "crypto";
import User from "../../models/User.js";
import WalletTransaction from "../../models/WalletTransaction.js";


export const cashfreeWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-webhook-signature"];
    const rawBody = req.rawBody;

    const expected = crypto
      .createHmac("sha256", process.env.CASHFREE_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("base64");

    if (signature !== expected) {
      return res.status(401).send("Invalid signature");
    }

    const payload = req.body;
    const orderId = payload.data.order.order_id;
    const status = payload.data.payment.payment_status;

    const txn = await WalletTransaction.findOne({ orderId });
    if (!txn || txn.status === "PAID") return res.sendStatus(200);

    txn.webhookPayload = payload;

    if (status === "SUCCESS") {
      txn.status = "PAID";
      txn.cfPaymentId = payload.data.payment.cf_payment_id;
      txn.creditedAt = new Date();

      const user = await User.findById(txn.user);
      user.wallet.main += txn.walletCreditAmount;
      await user.save();
    } else {
      txn.status = "FAILED";
    }

    await txn.save();
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
};
