import mongoose from "mongoose";
import SystemWallet from "../../models/SystemWallet.js";
import SystemWalletLog from "../../models/SystemWalletLog.js";
import WalletTransaction from "../../models/WalletTransaction.js";

export const getSystemWalletWithLogs = async (req, res) => {
  try {
    // 🔐 Admin guard
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    const {
      page = 1,
      limit = 20,
      source,
      sessionId,
      from,
      to
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));

    // ================= SYSTEM WALLET =================
    let wallet = await SystemWallet.findOne();

    // Ensure singleton wallet exists
    if (!wallet) {
      wallet = await SystemWallet.create({ balance: 0 });
    }

    // ================= LOG FILTER =================
    const filter = {};

    if (source) {
      filter.source = source;
    }

    if (sessionId) {
      filter.sessionId = sessionId;
    }

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    // ================= LOG QUERY =================
    const [logs, total] = await Promise.all([
      SystemWalletLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),

      SystemWalletLog.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      data: {
        wallet: {
          balance: wallet.balance,
          updatedAt: wallet.updatedAt
        },
        logs: {
          total,
          page: pageNum,
          limit: limitNum,
          items: logs
        }
      }
    });
  } catch (error) {
    console.error('System wallet fetch error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch system wallet data'
    });
  }
};


const toIST = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: true,
  });
};


const formatTransaction = (t) => {
  const netCredit =
    t.status === "CAPTURED"
      ? t.walletCreditAmount
      : 0;

  return {
    transactionId: t._id,
    orderId: t.orderId,

    user: {
      id: t.user?._id,
      name: t.user?.name,
      email: t.user?.email,
      phone: t.user?.phone,
      role: t.user?.role,
      avatar: t.user?.avatar,
    },

    gateway: {
      provider: t.paymentGateway,
      razorpayOrderId: t.razorpayOrderId,
      razorpayPaymentId: t.razorpayPaymentId,
      razorpayStatus: t.razorpayStatus,
      signaturePresent: !!t.razorpaySignature,
    },

    amounts: {
      gross: t.grossAmount,
      walletCredit: t.walletCreditAmount,
      platformFee: t.platformFeeAmount,
      netCredited: netCredit,
      currency: t.currency,
    },

    status: t.status,

    timeline: {
      createdAt: toIST(t.createdAt),
      creditedAt: toIST(t.creditedAt),
      updatedAt: toIST(t.updatedAt),
    },

    billingInfo: {
      name: t.billingInfo?.name,
      email: t.billingInfo?.email,
      phone: t.billingInfo?.phone,
    },

    meta: {
      webhookStored: !!t.webhookPayload,
    },
  };
};


export const getTransactionsHistoryForAdmin = async (req, res) => {
  try {
    const {
      transactionId,
      page = 1,
      limit = 10,
      status,
      userId,
      gateway,
      fromDate,
      toDate,
    } = req.query;

    // ================= SINGLE TRANSACTION =================
    if (transactionId) {
      if (!mongoose.Types.ObjectId.isValid(transactionId)) {
        return res.json({
          success: false,
          message: "Invalid transactionId",
        });
      }

      const tx = await WalletTransaction.findById(transactionId)
        .populate("user", "name email phone role avatar");

      if (!tx) {
        return res.json({
          success: false,
          message: "Transaction not found",
        });
      }

      return res.json({
        success: true,
        data: formatTransaction(tx),
      });
    }

    // ================= BULK QUERY =================
    const query = {};

    if (status) query.status = status;
    if (gateway) query.paymentGateway = gateway;
    if (userId) query.user = userId;

    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [transactions, total] = await Promise.all([
      WalletTransaction.find(query)
        .populate("user", "name email phone role avatar")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      WalletTransaction.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: {
        items: transactions.map(formatTransaction),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Admin wallet transaction fetch error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch wallet transactions",
    });
  }
};
