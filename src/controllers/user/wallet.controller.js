// 19. GET  /api/user/wallet               # getWalletBalance()
// 20. GET  /api/user/transactions         # getTransactionHistory()

import Session from '../../models/Session.js';
import User from '../../models/User.js';
import WalletTransaction from "../../models/WalletTransaction.js";
import CCavenueUtil from "../../utils/ccavenueUtil.js";

const ccav = new CCavenueUtil(process.env.CCAVENUE_WORKING_KEY);

export const getWalletBalance = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Find user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(200).json({
        success: false,
        message: 'User not found',
        data: null
      });
    }

    // Prepare response based on user role
    let responseData = {
      userId: user._id,
      role: user.role
    };

    if (user.role === 'customer') {
      // Customer wallet information
      responseData = {
        ...responseData,
        wallet: {
          main: user.wallet.main,
          bonus: user.wallet.bonus,
          total: user.wallet.main + user.wallet.bonus
        },
        referralInfo: {
          referralCode: user.referralCode,
          totalReferrals: user.totalReferrals
        }
      };

      // Get recent spending (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentSpending = await Session.aggregate([
        {
          $match: {
            customer: user._id,
            status: 'completed',
            endedAt: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: null,
            totalSpent: { $sum: '$totalCost' },
            sessionCount: { $sum: 1 }
          }
        }
      ]);

      responseData.recentActivity = {
        last30DaysSpent: recentSpending.length > 0 ? recentSpending[0].totalSpent : 0,
        last30DaysSessions: recentSpending.length > 0 ? recentSpending[0].sessionCount : 0
      };

    } else if (user.role === 'consultant') {
      // Consultant earnings information
      responseData = {
        ...responseData,
        wallet: {
          available: user.consultantProfile.wallet.available,
          pending: user.consultantProfile.wallet.pending,
          totalEarned: user.consultantProfile.wallet.totalEarned
        },
        consultantStats: {
          totalSessions: user.consultantProfile.totalSessions,
          ratingAverage: user.consultantProfile.ratingAverage,
          ratingCount: user.consultantProfile.ratingCount
        }
      };

      // Get recent earnings (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentEarnings = await Session.aggregate([
        {
          $match: {
            consultant: user._id,
            status: 'completed',
            endedAt: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: null,
            totalEarned: { $sum: '$consultantEarning' },
            sessionCount: { $sum: 1 },
            totalMinutes: { $sum: '$durationMinutes' }
          }
        }
      ]);

      responseData.recentActivity = {
        last30DaysEarned: recentEarnings.length > 0 ? recentEarnings[0].totalEarned : 0,
        last30DaysSessions: recentEarnings.length > 0 ? recentEarnings[0].sessionCount : 0,
        last30DaysMinutes: recentEarnings.length > 0 ? recentEarnings[0].totalMinutes : 0
      };
    }

    return res.status(200).json({
      success: true,
      message: 'Wallet information retrieved successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Get wallet balance error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve wallet information',
      data: null
    });
  }
};


export const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 10, status } = req.query;

    const query = { user: userId };
    if (status) {
      query.status = status;
    }

    const transactions = await WalletTransaction.find(query)
      .select("-rawResponse")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await WalletTransaction.countDocuments(query);

    return res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get transactions error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get transactions",
    });
  }
};


export const getRechargeHistory = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Query params
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const status = req.query.status; // optional: PAID | FAILED | CREATED | CANCELLED

    const query = {
      user: userId
    };

    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      WalletTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select({
          orderId: 1,
          grossAmount: 1,
          walletCreditAmount: 1,
          platformFeeAmount: 1,
          currency: 1,
          status: 1,
          cfPaymentId: 1,
          creditedAt: 1,
          createdAt: 1,
        })
        .lean(),

      WalletTransaction.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        items: transactions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });

  } catch (error) {
    console.error("Get recharge history error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch recharge history",
      data: null,
    });
  }
};

/**
 * Generate unique order ID
 */
const generateOrderId = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `COLIO_${timestamp}_${random}`;
};

export const rechargeWallet = async (req, res) => {
  console.log("──────── RECHARGE WALLET REQUEST ────────");

  try {
    const userId = req.user.userId;
    const { amount } = req.body;

    // Validate amount
    if (!amount || Number(amount) < 50) {
      return res.status(400).json({
        success: false,
        message: "Minimum recharge amount is ₹50",
      });
    }

    // Get user
    const user = await User.findById(userId);
    if (!user || user.role !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Calculate amounts
    const grossAmount = Number(amount);
    const walletCreditAmount = Math.floor(grossAmount * 0.8); // 80% to wallet
    const platformFeeAmount = grossAmount - walletCreditAmount; // 20% platform fee

    // Generate unique order ID
    const orderId = generateOrderId();

    // Create transaction record
    const transaction = await WalletTransaction.create({
      user: user._id,
      orderId,
      grossAmount,
      walletCreditAmount,
      platformFeeAmount,
      currency: "INR",
      status: "CREATED",
      billingInfo: {
        name: user.name || "COLIO_CUSTOMER",
        email: user.email || "customer@colio.in",
        phone: user.phone || "9990000099",
      },
    });

    console.log("Transaction created:", orderId);

    // Prepare CCAvenue order parameters
    const orderParams = {
      merchant_id: process.env.CCAVENUE_MERCHANT_ID,
      order_id: orderId,
      currency: "INR",
      amount: grossAmount.toFixed(2),
      redirect_url: `${process.env.BACKEND_URL}/ccavenue/response`,
      cancel_url: `${process.env.BACKEND_URL}/ccavenue/cancel`,
      language: "EN",

      // Billing info
      billing_name: user.name || "",
      billing_email: user.email || "",
      billing_tel: user.phone || "",
      billing_address: "",
      billing_city: "",
      billing_state: "",
      billing_zip: "",
      billing_country: "India",

      // Merchant params (can store custom data)
      merchant_param1: user._id.toString(),
      merchant_param2: walletCreditAmount.toString(),
      merchant_param3: "wallet_recharge",
    };

    // Encrypt order data
    const encryptedData = ccav.getEncryptedOrder(orderParams);

    console.log("Encrypted data generated for order:", orderId);
    console.log("──────── RECHARGE WALLET DONE ────────");

    // Return data needed by frontend
    return res.json({
      success: true,
      data: {
        orderId,
        encRequest: encryptedData,
        accessCode: process.env.CCAVENUE_ACCESS_CODE,
        ccavenueUrl: getCCAvenueUrl(),
        amount: grossAmount,
        walletCreditAmount,
      },
    });
  } catch (error) {
    console.error("🔥 Recharge wallet error:", error);
    return res.status(500).json({
      success: false,
      message: "Payment initiation failed",
    });
  }
};

/**
 * Handle CCAvenue response - Step 2
 * Called by CCAvenue after payment completion (success/failure)
 *
 * @route POST /api/wallet/ccavenue/response
 */
export const ccavenueResponse = async (req, res) => {
  console.log("──────── CCAVENUE RESPONSE HIT ────────");

  try {
    const { encResp } = req.body;

    if (!encResp) {
      console.error("❌ No encrypted response received");
      return res.redirect(
        `${process.env.FRONTEND_URL}/recharge/failed?error=invalid_response`
      );
    }

    // Decrypt response
    const responseData = ccav.redirectResponseToJson(encResp);
    console.log("Decrypted response:", JSON.stringify(responseData, null, 2));

    const { order_id, order_status, tracking_id } = responseData;

    console.log("Order ID:", order_id);
    console.log("Order Status:", order_status);
    console.log("Tracking ID:", tracking_id);

    // Find transaction
    const txn = await WalletTransaction.findOne({ orderId: order_id });

    if (!txn) {
      console.error("❌ Transaction not found for order:", order_id);
      return res.redirect(
        `${process.env.FRONTEND_URL}/recharge/failed?error=transaction_not_found`
      );
    }

    // Check if already processed
    if (txn.status === "PAID") {
      console.log("ℹ️ Transaction already processed");
      return res.redirect(
        `${process.env.FRONTEND_URL}/recharge/success?order_id=${order_id}`
      );
    }

    // Process based on status
    if (order_status === "Success") {
      console.log("💰 Payment SUCCESS");

      // Update transaction
      await txn.markAsPaid(responseData);

      // Credit user wallet
      const user = await User.findById(txn.user);
      if (user) {
        user.wallet.main += txn.walletCreditAmount;
        await user.save();
        console.log("✅ Wallet credited:", txn.walletCreditAmount);
      }

      console.log("──────── RESPONSE PROCESSING DONE ────────");
      return res.redirect(
        `${process.env.FRONTEND_URL}/recharge/success?order_id=${order_id}&amount=${txn.walletCreditAmount}`
      );
    } else if (order_status === "Aborted") {
      console.log("⚠️ Payment ABORTED by user");
      await txn.markAsAborted(responseData);

      return res.redirect(
        `${process.env.FRONTEND_URL}/recharge/cancelled?order_id=${order_id}`
      );
    } else {
      // Failure, Invalid, Timeout, etc.
      console.log("❌ Payment FAILED:", order_status);
      await txn.markAsFailed(responseData);

      const failureMessage = encodeURIComponent(
        responseData.failure_message || "Payment failed"
      );
      return res.redirect(
        `${process.env.FRONTEND_URL}/recharge/failed?order_id=${order_id}&message=${failureMessage}`
      );
    }
  } catch (error) {
    console.error("🔥 CCAvenue response error:", error);
    return res.redirect(
      `${process.env.FRONTEND_URL}/recharge/failed?error=processing_error`
    );
  }
};

export const ccavenueCancel = async (req, res) => {
  console.log("──────── CCAVENUE CANCEL HIT ────────");

  try {
    const { encResp } = req.body;

    if (encResp) {
      const responseData = ccav.redirectResponseToJson(encResp);
      const { order_id } = responseData;

      if (order_id) {
        const txn = await WalletTransaction.findOne({ orderId: order_id });
        if (txn && txn.status === "CREATED") {
          await txn.markAsAborted(responseData);
        }
      }
    }

    return res.redirect(`${process.env.FRONTEND_URL}/recharge/cancelled`);
  } catch (error) {
    console.error("🔥 CCAvenue cancel error:", error);
    return res.redirect(`${process.env.FRONTEND_URL}/recharge/cancelled`);
  }
};


export const getTransactionStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.userId;

    const txn = await WalletTransaction.findOne({
      orderId,
      user: userId,
    }).select("-rawResponse");

    if (!txn) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    return res.json({
      success: true,
      data: txn,
    });
  } catch (error) {
    console.error("Get transaction error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get transaction",
    });
  }
};