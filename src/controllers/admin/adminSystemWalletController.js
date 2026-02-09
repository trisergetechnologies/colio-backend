import mongoose from "mongoose";
import PaymentHistory from "../../models/PaymentHistory.js";
import SystemWallet from "../../models/SystemWallet.js";
import SystemWalletLog from "../../models/SystemWalletLog.js";

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


export const getPaymentsForAdmin = async (req, res) => {
  try {
    const admin = req.user;

    // 🔐 Admin guard
    if (admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    const {
      page = 1,
      limit = 10,
      status,     // pending | success | failed
      userId,     // optional filter
    } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      query.user = userId;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [payments, total] = await Promise.all([
      PaymentHistory.find(query)
        .populate(
          "user",
          "name email phone role avatar wallet"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      PaymentHistory.countDocuments(query),
    ]);

    // 🔍 Admin-friendly transformation
    const items = payments.map((p) => ({
      paymentId: p._id,

      user: {
        id: p.user?._id,
        name: p.user?.name,
        email: p.user?.email,
        phone: p.user?.phone,
        role: p.user?.role,
        avatar: p.user?.avatar,
      },

      amount: p.amount,
      status: p.status,
      paymentMethod: p.paymentMethod,

      razorpay: {
        orderId: p.razorpayOrderId,
        paymentId: p.razorpayPaymentId,
      },

      timeline: {
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      },
    }));

    // 📊 Quick admin summary (very useful)
    const summary = {
      totalPayments: total,
      totalAmount: payments.reduce(
        (sum, p) => sum + (p.status === "success" ? p.amount : 0),
        0
      ),
      successCount: payments.filter((p) => p.status === "success").length,
      failedCount: payments.filter((p) => p.status === "failed").length,
      pendingCount: payments.filter((p) => p.status === "pending").length,
    };

    return res.json({
      success: true,
      data: {
        items,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
        summary,
      },
    });
  } catch (error) {
    console.error("Admin get payments error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payments",
    });
  }
};