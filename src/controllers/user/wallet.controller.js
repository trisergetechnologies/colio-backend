// 19. GET  /api/user/wallet               # getWalletBalance()
// 20. GET  /api/user/transactions         # getTransactionHistory()

import { Cashfree, CFEnvironment } from "cashfree-pg";
import { PaymentHistory } from '../../models/PaymentHistory.js';
import Session from '../../models/Session.js';
import User from '../../models/User.js';
import WalletTransaction from "../../models/WalletTransaction.js";

/**
 * Get wallet balance
 * @route GET /api/user/wallet
 * @desc Get user's wallet information and balance
 * @access Private (Both customer & consultant)
 */
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

/**
 * Get transaction history
 * @route GET /api/user/transactions
 * @desc Get user's transaction history with pagination
 * @access Private (Both customer & consultant)
 */
export const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      page = 1,
      limit = 20,
      status
    } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.max(parseInt(limit, 10) || 20, 1);
    const skip = (pageNumber - 1) * limitNumber;

    // Build query
    const query = { user: userId };
    if (status && ['pending', 'success', 'failed'].includes(status)) {
      query.status = status;
    }

    // Fetch data in parallel
    const [transactions, totalCount] = await Promise.all([
      PaymentHistory.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      PaymentHistory.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalCount / limitNumber);

    return res.status(200).json({
      success: true,
      message: 'Transaction history retrieved successfully',
      data: {
        pagination: {
          currentPage: pageNumber,
          limit: limitNumber,
          total: totalCount,
          totalPages,
          hasNextPage: pageNumber < totalPages,
          hasPrevPage: pageNumber > 1
        },
        transactions: transactions.map(tx => ({
          id: tx._id,
          amount: tx.amount,
          status: tx.status,
          paymentMethod: tx.paymentMethod,
          razorpayOrderId: tx.razorpayOrderId,
          razorpayPaymentId: tx.razorpayPaymentId,
          createdAt: tx.createdAt,
          updatedAt: tx.updatedAt
        }))
      }
    });

  } catch (error) {
    console.error('Get transaction history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve transaction history',
      data: null
    });
  }
};

const cashfree = new Cashfree(
  CFEnvironment.PRODUCTION,
  process.env.CASHFREE_APP_ID,
  process.env.CASHFREE_SECRET_KEY
);


export const rechargeWallet = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount } = req.body;

    if (!amount || Number(amount) < 50) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const user = await User.findById(userId);
    if (!user || user.role !== "customer") {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const grossAmount = Number(amount);
    const walletCreditAmount = Math.floor(grossAmount * 0.8);
    const platformFeeAmount = grossAmount - walletCreditAmount;

    const orderRequest = {
      order_amount: grossAmount,
      order_currency: "INR",
      customer_details: {
        customer_id: user._id.toString(),
        customer_email: user.email || "customer@colio.in",
        customer_phone: user.phone || "9999999999"
      },
      order_meta: {
        return_url: `${process.env.FRONTEND_URL}/recharge/return?order_id={order_id}`,
      },
    };

    const cfResponse = await cashfree.PGCreateOrder(orderRequest);

    await WalletTransaction.create({
      user: user._id,
      orderId: cfResponse.data.order_id,
      paymentSessionId: cfResponse.data.payment_session_id,
      grossAmount,
      walletCreditAmount,
      platformFeeAmount,
    });

    return res.json({
      success: true,
      data: {
        orderId: cfResponse.data.order_id,
        paymentSessionId: cfResponse.data.payment_session_id,
      },
    });
  } catch (err) {
    console.error("Cashfree order error:", err);
    res.status(500).json({ success: false, message: "Payment initiation failed" });
  }
};