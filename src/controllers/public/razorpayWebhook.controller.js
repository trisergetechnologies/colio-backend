import crypto from "crypto";
import User from "../../models/User.js";
import WalletTransaction from "../../models/WalletTransaction.js";

export const razorpayWebhook = async (req, res) => {
  try {
    console.log("WEBHOOK HIT");
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    const body = JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== signature) {
      return res.status(401).send("Invalid signature");
    }

    const event = req.body.event;
    const payment = req.body.payload?.payment?.entity;

    if (!payment) return res.sendStatus(200);

    const txn = await WalletTransaction.findOne({
      razorpayOrderId: payment.order_id,
    });

    if (!txn) return res.sendStatus(200);

    // 🔹 AUTHORIZED (pending)
    if (event === "payment.authorized") {
      txn.status = "AUTHORIZED";
      txn.razorpayPaymentId = payment.id;
      await txn.save();
    }

    // ✅ SUCCESS
    if (event === "payment.captured") {
      if (txn.status !== "CAPTURED") {
        txn.status = "CAPTURED";
        txn.razorpayPaymentId = payment.id;
        txn.creditedAt = new Date();

        const user = await User.findById(txn.user);
        if (user) {
          user.wallet.main += txn.walletCreditAmount;
          await user.save();
        }

        await txn.save();
      }
    }

    // ❌ FAILED
    if (event === "payment.failed") {
      txn.status = "FAILED";
      console.log("WEBHOOK FAILED");
      await txn.save();
    }
    console.log("WEBHOOK RETURNIG");
    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    return res.sendStatus(500);
  }
};
