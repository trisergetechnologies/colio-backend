import Settlement from "../../models/SettlementModel.js";
import User from "../../models/User.js";

/**
 * ADMIN ONLY
 * Create pending settlement(s)
 *
 * Modes:
 * 1. No email passed → create settlements for all eligible consultants
 * 2. Email passed → create settlement for a single consultant
 *
 * Body:
 * {
 *   "email": "consultant@email.com" // optional
 * }
 */
export const createPendingSettlements = async (req, res) => {
  try {
    const { email } = req.body;

    const adminId = req.user._id;
    let consultants = [];

    // ================= SINGLE CONSULTANT MODE =================
    if (email) {
      const consultant = await User.findOne({
        email: email.toLowerCase(),
        role: 'consultant',
        isActive: true
      });

      if (!consultant) {
        return res.status(404).json({
          success: false,
          message: 'Consultant not found'
        });
      }

      consultants = [consultant];
    }

    // ================= BULK MODE =================
    if (!email) {
      consultants = await User.find({
        role: 'consultant',
        isActive: true
      });
    }

    if (!consultants.length) {
      return res.status(200).json({
        success: true,
        message: 'No consultants found for settlement',
        created: 0
      });
    }

    let createdCount = 0;
    let skipped = [];

    for (const consultant of consultants) {
      const wallet = consultant.consultantProfile?.wallet;
      const bank = consultant.consultantProfile?.bankDetails;

      // ---------- VALIDATIONS ----------
      if (!wallet || wallet.available <= 0) {
        skipped.push({
          consultant: consultant.email,
          reason: 'No available balance'
        });
        continue;
      }

      if (!bank || !bank.isVerified) {
        skipped.push({
          consultant: consultant.email,
          reason: 'Bank details missing or unverified'
        });
        continue;
      }

      // ---------- DUPLICATE CHECK ----------
      const existingPending = await Settlement.findOne({
        consultant: consultant._id,
        status: 'pending'
      });

      if (existingPending) {
        skipped.push({
          consultant: consultant.email,
          reason: 'Existing pending settlement'
        });
        continue;
      }

      // ---------- CREATE SETTLEMENT ----------
      const settlementAmount = wallet.available;

      const settlement = await Settlement.create({
        consultant: consultant._id,
        amount: settlementAmount,
        bankSnapshot: {
          accountHolderName: bank.accountHolderName,
          bankName: bank.bankName,
          accountNumber: bank.accountNumber,
          ifscCode: bank.ifscCode,
          upiId: bank.upiId
        },
        generatedBy: 'manual'
      });

      // ---------- WALLET LOCK ----------
      consultant.consultantProfile.wallet.available -= settlementAmount;
      consultant.consultantProfile.wallet.pending += settlementAmount;
      await consultant.save();

      createdCount++;
    }

    return res.status(201).json({
      success: true,
      message: 'Settlement generation completed',
      created: createdCount,
      skipped
    });

  } catch (error) {
    console.error('Settlement creation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create settlements',
      error: error.message
    });
  }
};



export const approveSettlement = async (req, res) => {
  try {
    const { settlementId } = req.params;
    const { utr } = req.body;
    const adminId = req.user._id;

    if (!utr) {
      return res.status(400).json({
        success: false,
        message: 'UTR is required'
      });
    }

    const settlement = await Settlement.findOne({
      _id: settlementId,
      status: 'pending'
    }).populate('consultant');

    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: 'Pending settlement not found'
      });
    }

    const consultant = settlement.consultant;
    const wallet = consultant.consultantProfile.wallet;

    if (wallet.pending < settlement.amount) {
      return res.status(409).json({
        success: false,
        message: 'Wallet pending balance mismatch'
      });
    }

    // ✅ ATOMIC UPDATE (important)
    await Settlement.findByIdAndUpdate(
      settlementId,
      {
        $set: {
          status: 'settled',
          utr: utr.toUpperCase(),
          approvedBy: adminId,
          approvedAt: new Date()
        }
      },
      { runValidators: true }
    );

    // ✅ Wallet update
    wallet.pending -= settlement.amount;
    await consultant.save();

    return res.status(200).json({
      success: true,
      message: 'Settlement approved & settled successfully',
      settlementId
    });

  } catch (error) {
    console.error('Approve settlement error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to approve settlement'
    });
  }
};


export const rejectSettlement = async (req, res) => {
  try {
    const { settlementId } = req.params;
    const { reason } = req.body;
    const adminId = req.user._id;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const settlement = await Settlement.findOne({
      _id: settlementId,
      status: 'pending'
    }).populate('consultant');

    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: 'Pending settlement not found'
      });
    }

    const consultant = settlement.consultant;
    const wallet = consultant.consultantProfile.wallet;

    
    // ---------- UPDATE SETTLEMENT ----------
    settlement.status = 'rejected';
    settlement.rejectionReason = reason;
    settlement.approvedBy = adminId;
    settlement.approvedAt = new Date();

    await settlement.save();

    // ---------- ROLLBACK WALLET ----------
    wallet.pending = 0;
    wallet.available += settlement.amount;

    await consultant.save();

    return res.status(200).json({
      success: true,
      message: 'Settlement rejected and amount reverted',
      settlementId: settlement._id
    });

  } catch (error) {
    console.error('Reject settlement error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject settlement',
      error: error.message
    });
  }
};


export const getSettlementsForAdmin = async (req, res) => {
  try {
    const {
      status,
      page = 1,
      limit = 20,
      consultantId
    } = req.query;

    const query = {};

    // ---------- STATUS FILTER ----------
    if (status) {
      query.status = status;
    }

    // ---------- CONSULTANT FILTER ----------
    if (consultantId) {
      query.consultant = consultantId;
    }

    const pageNumber = Math.max(parseInt(page), 1);
    const pageSize = Math.min(parseInt(limit), 100); // hard cap

    // ---------- DATA QUERY ----------
    const settlements = await Settlement.find(query)
      .populate({
        path: 'consultant',
        select: 'name email consultantProfile.wallet'
      })
      .populate({
        path: 'approvedBy',
        select: 'name email'
      })
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .lean();

    // ---------- COUNT ----------
    const totalCount = await Settlement.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: settlements,
      pagination: {
        total: totalCount,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });

  } catch (error) {
    console.error('Get settlements admin error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch settlements',
      error: error.message
    });
  }
};