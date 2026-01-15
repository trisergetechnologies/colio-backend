import { Cashfree } from "cashfree-pg";
import crypto from "crypto";
import User from "../../models/User.js";
import WalletTransaction from "../../models/WalletTransaction.js";

// Initialize Cashfree SDK
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = Cashfree.Environment.SANDBOX; // Change to PRODUCTION for live

export const cashfreeWebhook = async (req, res) => {
  console.log("──────── CASHFREE WEBHOOK HIT ────────");

  try {
    // 1. Get headers
    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];

    console.log("Headers received:", {
      signature: signature ? "present" : "missing",
      timestamp: timestamp ? "present" : "missing",
    });

    if (!signature || !timestamp) {
      console.error("❌ Missing required headers");
      return res.status(400).send("Missing headers");
    }

    // 2. Get raw body as string
    if (!Buffer.isBuffer(req.body)) {
      console.error("❌ Body is not a buffer");
      return res.status(500).send("Invalid body format");
    }

    const rawBody = req.body.toString("utf8");
    console.log("Raw body length:", rawBody.length);

    // 3. Verify signature using Cashfree SDK (RECOMMENDED)
    try {
      const webhookEvent = Cashfree.PGVerifyWebhookSignature(
        signature,
        rawBody,
        timestamp
      );
      console.log("✅ Signature verified via SDK");
      console.log("Webhook event type:", webhookEvent?.type);
    } catch (sdkError) {
      console.error("❌ SDK Signature verification failed:", sdkError.message);
      
      // Fallback: Manual verification
      const secretKey = process.env.CASHFREE_SECRET_KEY;
      const signedPayload = timestamp + rawBody;
      const expectedSignature = crypto
        .createHmac("sha256", secretKey)
        .update(signedPayload)
        .digest("base64");

      console.log("Manual verification:");
      console.log("  Expected:", expectedSignature);
      console.log("  Received:", signature);

      if (expectedSignature !== signature) {
        console.error("❌ Manual signature verification also failed");
        return res.status(401).send("Invalid signature");
      }
      console.log("✅ Manual signature verified");
    }

    // 4. Parse payload
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

    // 5. Find transaction
    const txn = await WalletTransaction.findOne({ orderId });

    if (!txn) {
      console.warn("⚠️ No transaction found for order:", orderId);
      return res.sendStatus(200); // Return 200 to prevent retries
    }

    if (txn.status === "PAID") {
      console.log("ℹ️ Transaction already PAID — skipping duplicate");
      return res.sendStatus(200);
    }

    // 6. Save webhook payload
    txn.webhookPayload = payload;

    // 7. Process based on status
    if (paymentStatus === "SUCCESS") {
      console.log("💰 Payment SUCCESS — crediting wallet");

      txn.status = "PAID";
      txn.cfPaymentId = payload.data.payment.cf_payment_id;
      txn.creditedAt = new Date();

      const user = await User.findById(txn.user);
      if (user) {
        user.wallet.main += txn.walletCreditAmount;
        await user.save();
        console.log("✅ Wallet credited:", txn.walletCreditAmount);
        console.log("✅ New balance:", user.wallet.main);
      } else {
        console.error("❌ User not found:", txn.user);
      }
    } else if (paymentStatus === "FAILED" || paymentStatus === "CANCELLED") {
      console.log("❌ Payment FAILED/CANCELLED");
      txn.status = "FAILED";
    } else {
      console.log("⏳ Payment status:", paymentStatus);
    }

    await txn.save();
    console.log("✅ Transaction saved with status:", txn.status);
    console.log("──────── WEBHOOK DONE ────────");

    return res.sendStatus(200);

  } catch (error) {
    console.error("🔥 WEBHOOK CRASH:", error);
    return res.sendStatus(500);
  }
};