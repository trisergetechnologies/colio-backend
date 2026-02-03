import crypto from "crypto";
import User from "../../models/User.js";
import WalletTransaction from "../../models/WalletTransaction.js";

export const razorpayWebhook = async (req, res) => {
  try {
    console.log("💬 Razorpay webhook received");

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];
    console.log("💬 Secret and signature received:", secret, signature);

    // ✅ RAW BODY (Buffer)
    const rawBody = req.body;
    console.log("💬 Raw body received:", rawBody);

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    console.log("💬 Expected signature:", expectedSignature);

    if (expectedSignature !== signature) {
      console.error("❌ Razorpay webhook signature mismatch");
      return res.status(401).send("Invalid signature");
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    console.log("💬 Payload parsed:", payload);

    const event = payload.event;
    const payment = payload.payload?.payment?.entity;
    console.log("💬 Event:", event, "Payment entity:", payment);

    if (!payment) {
      console.log("💬 No payment found, returning early.");
      return res.sendStatus(200);
    }

    const txn = await WalletTransaction.findOne({
      razorpayOrderId: payment.order_id,
    });
    console.log("💬 Transaction found:", txn);

    if (!txn) {
      console.log("💬 Transaction not found for order ID:", payment.order_id);
      return res.sendStatus(200);
    }

    // 🔹 AUTHORIZED
    if (event === "payment.authorized") {
      console.log("💬 Payment authorized event received");
      txn.status = "AUTHORIZED";
      txn.razorpayPaymentId = payment.id;
      await txn.save();
      console.log("💬 Transaction status set to AUTHORIZED");
    }

    // ✅ CAPTURED = SUCCESS
    if (event === "payment.captured") {
      console.log("💬 Payment captured event received");
      if (txn.status !== "CAPTURED") {
        txn.status = "CAPTURED";
        txn.razorpayPaymentId = payment.id;
        txn.creditedAt = new Date();

        const user = await User.findById(txn.user);
        console.log("💬 User found:", user);

        if (user) {
          user.wallet.main += txn.walletCreditAmount;
          await user.save();
          console.log("💬 User wallet updated with credited amount:", txn.walletCreditAmount);
        }

        await txn.save();
        console.log("💬 Transaction status set to CAPTURED");
      } else {
        console.log("💬 Transaction already captured");
      }
    }

    // ❌ FAILED
    if (event === "payment.failed") {
      console.log("💬 Payment failed event received");
      txn.status = "FAILED";
      await txn.save();
      console.log("💬 Transaction status set to FAILED");
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("🔥 Razorpay Webhook error:", err);
    return res.sendStatus(500);
  }
};
