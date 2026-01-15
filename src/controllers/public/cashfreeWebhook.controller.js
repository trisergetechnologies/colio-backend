import crypto from "crypto";
import User from "../../models/User.js";
import WalletTransaction from "../../models/WalletTransaction.js";


export const cashfreeWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("CASHFREE_WEBHOOK_SECRET missing");
      return res.sendStatus(500);
    }

    const signature = req.headers["x-webhook-signature"];
    if (!signature) {
      return res.status(400).send("Missing signature");
    }

    // ✅ req.body IS Buffer because of express.raw()
    const rawBody = req.body;

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("base64");

    if (signature !== expectedSignature) {
      return res.status(401).send("Invalid signature");
    }

    // Parse AFTER verification
    const payload = JSON.parse(rawBody.toString("utf8"));

    const orderId = payload?.data?.order?.order_id;
    const paymentStatus = payload?.data?.payment?.payment_status;

    if (!orderId || !paymentStatus) {
      return res.sendStatus(400);
    }

    const txn = await WalletTransaction.findOne({ orderId });
    if (!txn || txn.status === "PAID") return res.sendStatus(200);

    txn.webhookPayload = payload;

    if (paymentStatus === "SUCCESS") {
      txn.status = "PAID";
      txn.cfPaymentId = payload.data.payment.cf_payment_id;
      txn.creditedAt = new Date();

      const user = await User.findById(txn.user);
      if (user) {
        user.wallet.main += txn.walletCreditAmount;
        await user.save();
      }
    } else {
      txn.status = "FAILED";
    }

    await txn.save();
    return res.sendStatus(200);
  } catch (err) {
    console.error("Cashfree Webhook Error:", err);
    return res.sendStatus(500);
  }
};
