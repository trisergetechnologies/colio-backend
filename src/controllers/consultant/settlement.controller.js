// controllers/consultant/settlement.controller.js
import Settlement from "../../models/SettlementModel.js";

export const getSettlements = async (req, res) => {
  try {
    const { userId, role } = req.user;

    // Role guard
    if (role !== 'consultant') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
        data: null
      });
    }

    // Pagination params
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    // Optional filters
    const { status, fromDate, toDate } = req.query;

    const query = {
      consultant: userId
    };

    if (status) {
      query.status = status;
    }

    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    } 

    // Fetch data
    const [settlements, total] = await Promise.all([
      Settlement.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Settlement.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      message: 'Settlements fetched successfully',
      data: {
        settlements,
        pagination: {
          page,
          limit,
          totalRecords: total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get settlements error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch settlements',
      data: null
    });
  }
};
