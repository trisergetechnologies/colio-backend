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
