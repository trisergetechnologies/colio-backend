import crypto from "crypto";
import User from "../../models/User.js";
import WalletTransaction from "../../models/WalletTransaction.js";


export const cashfreeWebhook = async (req, res) => {
  console.log("──────── CASHFREE WEBHOOK HIT ────────");

  try {
    const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("❌ CASHFREE_WEBHOOK_SECRET missing");
      return res.sendStatus(500);
    }

    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];
    
    if (!signature) {
      console.error("❌ Missing x-webhook-signature header");
      return res.sendStatus(400);
    }
    
    if (!timestamp) {
      console.error("❌ Missing x-webhook-timestamp header");
      return res.sendStatus(400);
    }

    if (!Buffer.isBuffer(req.body)) {
      console.error("❌ BODY IS NOT BUFFER");
      return res.status(500).send("Body is not raw buffer");
    }

    // ✅ FIXED: Concatenate timestamp + rawBody, then HMAC
    const rawBody = req.body.toString("utf8");
    const signedPayload = timestamp + rawBody;
    
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(signedPayload)
      .digest("base64");

    console.log("Timestamp:", timestamp);
    console.log("Computed signature:", expectedSignature);
    console.log("Received signature:", signature);

    if (expectedSignature !== signature) {
      console.error("❌ Signature mismatch");
      return res.status(401).send("Invalid signature");
    }

    console.log("✅ Signature verified");

    // Parse payload AFTER verification
    const payload = JSON.parse(rawBody);
    console.log("Parsed payload:", JSON.stringify(payload, null, 2));

    const orderId = payload?.data?.order?.order_id;
    const paymentStatus = payload?.data?.payment?.payment_status;

    if (!orderId || !paymentStatus) {
      console.error("❌ Invalid payload structure");
      return res.sendStatus(400);
    }

    console.log("Order ID:", orderId);
    console.log("Payment status:", paymentStatus);

    const txn = await WalletTransaction.findOne({ orderId });

    if (!txn) {
      console.warn("⚠️ No WalletTransaction found for order:", orderId);
      return res.sendStatus(200);
    }

    if (txn.status === "PAID") {
      console.log("ℹ️ Transaction already PAID — skipping");
      return res.sendStatus(200);
    }

    txn.webhookPayload = payload;

    if (paymentStatus === "SUCCESS") {
      console.log("💰 Payment SUCCESS — crediting wallet");

      txn.status = "PAID";
      txn.cfPaymentId = payload.data.payment.cf_payment_id;
      txn.creditedAt = new Date();

      const user = await User.findById(txn.user);
      if (!user) {
        console.error("❌ User not found for txn:", txn._id);
      } else {
        user.wallet.main += txn.walletCreditAmount;
        await user.save();
        console.log("✅ Wallet credited:", txn.walletCreditAmount);
      }
    } else {
      console.log("❌ Payment FAILED / CANCELLED");
      txn.status = "FAILED";
    }

    await txn.save();
    console.log("✅ Transaction updated");
    console.log("──────── WEBHOOK DONE ────────");
    
    return res.sendStatus(200);

  } catch (error) {
    console.error("🔥 CASHFREE WEBHOOK CRASH:", error);
    return res.sendStatus(500);
  }
};