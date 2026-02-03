// 19. GET  /api/user/wallet               # getWalletBalance()
// 20. GET  /api/user/transactions         # getTransactionHistory()

import Razorpay from "razorpay";
import Session from '../../models/Session.js';
import User from '../../models/User.js';
import WalletTransaction from "../../models/WalletTransaction.js";

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
  return `COLIO_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
};

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET, // ✅ FIXED
});

export const rechargeWallet = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.userId;

    if (!amount || amount < 50) {
      return res.status(400).json({
        success: false,
        message: "Minimum recharge amount is ₹50",
      });
    }

    const user = await User.findById(userId);
    if (!user || user.role !== "customer") {
      return res.status(403).json({ success: false });
    }

    const grossAmount = Number(amount);
    const walletCreditAmount = Math.floor(grossAmount * 0.8);
    const platformFeeAmount = grossAmount - walletCreditAmount;

    const orderId = generateOrderId();

    // 1️⃣ Razorpay order = payment intent
    const order = await razorpay.orders.create({
      amount: grossAmount * 100, // paise
      currency: "INR",
      receipt: orderId,
      payment_capture: 1, // auto capture
    });

    // 2️⃣ Save transaction BEFORE frontend
    await WalletTransaction.create({
      user: user._id,
      orderId,
      razorpayOrderId: order.id,
      grossAmount,
      walletCreditAmount,
      platformFeeAmount,
      currency: "INR",
      status: "CREATED",
      paymentGateway: "razorpay",
      billingInfo: {
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });

    return res.json({
      success: true,
      data: {
        razorpayOrderId: order.id,
        amount: order.amount, // paise
        currency: order.currency,
        key: process.env.RAZORPAY_KEY_ID,
        orderId,
      },
    });
  } catch (err) {
    console.error("Recharge error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to initiate payment",
    });
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


export const getRazorTransactionStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.userId;

    const txn = await WalletTransaction.findOne({
      orderId,
      user: userId,
    }).select("status razorpayPaymentId creditedAt");

    if (!txn) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    return res.json({
      success: true,
      data: {
        status: txn.status, // CREATED | AUTHORIZED | CAPTURED | FAILED
      },
    });
  } catch (err) {
    console.error("Transaction status error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to get transaction status",
    });
  }
};