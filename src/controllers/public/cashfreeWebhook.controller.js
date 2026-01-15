import crypto from "crypto";
import User from "../../models/User.js";
import WalletTransaction from "../../models/WalletTransaction.js";


export const cashfreeWebhook = async (req, res) => {
  console.log("──────── CASHFREE WEBHOOK HIT ────────");

  try {
    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];

    console.log("Headers:", { 
      signature: signature ? "present" : "missing", 
      timestamp: timestamp ? "present" : "missing" 
    });

    if (!signature || !timestamp) {
      console.error("❌ Missing required headers");
      return res.status(400).send("Missing headers");
    }

    if (!Buffer.isBuffer(req.body)) {
      console.error("❌ Body is not a buffer");
      return res.status(500).send("Invalid body format");
    }

    const rawBody = req.body.toString("utf8");
    
    // Manual signature verification
    // IMPORTANT: Use CASHFREE_SECRET_KEY (your API secret key)
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    const signedPayload = timestamp + rawBody;
    
    const expectedSignature = crypto
      .createHmac("sha256", secretKey)
      .update(signedPayload)
      .digest("base64");

    console.log("Secret key prefix:", secretKey?.substring(0, 8));
    console.log("Timestamp:", timestamp);
    console.log("Computed signature:", expectedSignature);
    console.log("Received signature:", signature);

    if (expectedSignature !== signature) {
      console.error("❌ Signature mismatch");
      return res.status(401).send("Invalid signature");
    }

    console.log("✅ Signature verified");

    // Parse payload
    const payload = JSON.parse(rawBody);
    console.log("Webhook type:", payload.type);

    const orderId = payload?.data?.order?.order_id;
    const paymentStatus = payload?.data?.payment?.payment_status;

    console.log("Order ID:", orderId);
    console.log("Payment Status:", paymentStatus);

    if (!orderId) {
      console.error("❌ No order_id in payload");
      return res.status(400).send("Invalid payload");
    }

    const txn = await WalletTransaction.findOne({ orderId });

    if (!txn) {
      console.warn("⚠️ No transaction found for order:", orderId);
      return res.sendStatus(200);
    }

    if (txn.status === "PAID") {
      console.log("ℹ️ Already PAID — skipping");
      return res.sendStatus(200);
    }

    txn.webhookPayload = payload;

    if (paymentStatus === "SUCCESS") {
      console.log("💰 Payment SUCCESS");

      txn.status = "PAID";
      txn.cfPaymentId = payload.data.payment.cf_payment_id;
      txn.creditedAt = new Date();

      const user = await User.findById(txn.user);
      if (user) {
        user.wallet.main += txn.walletCreditAmount;
        await user.save();
        console.log("✅ Wallet credited:", txn.walletCreditAmount);
      }
    } else {
      console.log("❌ Payment status:", paymentStatus);
      txn.status = "FAILED";
    }

    await txn.save();
    console.log("✅ Transaction saved:", txn.status);
    console.log("──────── WEBHOOK DONE ────────");

    return res.sendStatus(200);

  } catch (error) {
    console.error("🔥 WEBHOOK CRASH:", error);
    return res.sendStatus(500);
  }
};