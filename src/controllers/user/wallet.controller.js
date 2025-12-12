// 19. GET  /api/user/wallet               # getWalletBalance()
// 20. GET  /api/user/transactions         # getTransactionHistory()

import User from '../../models/User.js';
import Session from '../../models/Session.js';
import { PaymentHistory } from '../../models/PaymentHistory.js';

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


export const rechargeWallet = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount, paymentMethod } = req.body;

    // Basic validation
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(200).json({
        success: false,
        message: 'Invalid amount',
        data: null,
      });
    }

    // Find user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(200).json({
        success: false,
        message: 'User not found',
        data: null,
      });
    }

    // For demo, we typically allow only customers to recharge
    if (user.role !== 'customer') {
      return res.status(200).json({
        success: false,
        message: 'Only customers can recharge wallet',
        data: null,
      });
    }

    const rechargeAmount = Number(amount);

    // ------------------------------------------------------------------
    // DEMO PAYMENT FLOW
    // In a real integration you would:
    // 1. Create Razorpay order
    // 2. Confirm payment via webhook or verify signature
    // 3. Then mark payment history as success and credit wallet
    //
    // Here we directly mark payment as "success" and credit wallet.
    // ------------------------------------------------------------------

    const demoRazorpayOrderId = `demo_order_${Date.now()}`;
    const demoRazorpayPaymentId = `demo_pay_${Date.now()}`;

    // Create payment history entry
    const paymentRecord = await PaymentHistory.create({
      user: user._id,
      amount: rechargeAmount,
      razorpayOrderId: demoRazorpayOrderId,
      razorpayPaymentId: demoRazorpayPaymentId,
      status: 'success', // directly success for demo
      paymentMethod: paymentMethod || 'demo',
    });

    // Credit wallet (main balance)
    if (!user.wallet) {
      // Just in case, initialize wallet structure
      user.wallet = {
        main: 0,
        bonus: 0,
      };
    }

    user.wallet.main = (user.wallet.main || 0) + rechargeAmount;

    await user.save();

    const responseData = {
      userId: user._id,
      role: user.role,
      wallet: {
        main: user.wallet.main,
        bonus: user.wallet.bonus || 0,
        total: (user.wallet.main || 0) + (user.wallet.bonus || 0),
      },
      payment: {
        id: paymentRecord._id,
        amount: paymentRecord.amount,
        status: paymentRecord.status,
        razorpayOrderId: paymentRecord.razorpayOrderId,
        razorpayPaymentId: paymentRecord.razorpayPaymentId,
        paymentMethod: paymentRecord.paymentMethod,
        createdAt: paymentRecord.createdAt,
      },
    };

    return res.status(200).json({
      success: true,
      message: 'Wallet recharged successfully (demo)',
      data: responseData,
    });
  } catch (error) {
    console.error('Recharge wallet demo error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to recharge wallet',
      data: null,
    });
  }
};