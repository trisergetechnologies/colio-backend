import BlockReport from "../../models/BlockReport.js";
import User from "../../models/User.js";

export const blockUser = async (req, res) => {
  try {
    const { userIdToBlock, reason, description } = req.body;
    const blockerId = req.user.userId;

    if (!userIdToBlock || !reason) {
      return res.status(200).json({
        success: false,
        message: 'User ID and reason are required',
        data: null
      });
    }

    if (blockerId === userIdToBlock) {
      return res.status(200).json({
        success: false,
        message: 'You cannot block yourself',
        data: null
      });
    }

    const userToBlock = await User.findById(userIdToBlock)
      .select('name isActive');

    if (!userToBlock || !userToBlock.isActive) {
      return res.status(200).json({
        success: false,
        message: 'User not found or inactive',
        data: null
      });
    }

    const blocker = await User.findById(blockerId);

    if (blocker.blockedUsers?.includes(userIdToBlock)) {
      return res.status(200).json({
        success: false,
        message: 'User is already blocked',
        data: null
      });
    }

    const existingReport = await BlockReport.findOne({
      blockedBy: blockerId,
      blockedUser: userIdToBlock,
    });

    if (existingReport) {
      if (existingReport.isActive) {
        return res.status(200).json({
          success: false,
          message: "User is already blocked",
          data: null,
        });
      }

      // Reactivate block
      existingReport.reason = reason;
      existingReport.description = description;
      existingReport.isActive = true;
      await existingReport.save();
    } else {
      await BlockReport.create({
        blockedBy: blockerId,
        blockedUser: userIdToBlock,
        reason,
        description,
        isActive: true,
      });
    }


    // Save to user document (fast access)
    blocker.blockedUsers.push(userIdToBlock);
    await blocker.save();

    return res.status(200).json({
      success: true,
      message: `${userToBlock.name} has been blocked successfully`,
      data: {
        blockedUserId: userToBlock._id,
        reason
      }
    });

  } catch (error) {
    console.error('Block user error:', error);

    if (error.code === 11000) {
      return res.status(200).json({
        success: false,
        message: 'User already blocked',
        data: null
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to block user',
      data: null
    });
  }
};


export const getMyBlockedUsers = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId)
      .populate({
        path: 'blockedUsers',
        select: 'name avatar role isActive'
      })
      .select('blockedUsers');

    if (!user) {
      return res.status(200).json({
        success: false,
        message: 'User not found',
        data: null
      });
    }

    const blockedUsers = (user.blockedUsers || []).map(u => ({
      userId: u._id,
      name: u.name,
      avatar: u.avatar,
      role: u.role,
      isActive: u.isActive
    }));

    return res.status(200).json({
      success: true,
      message: 'Blocked users retrieved successfully',
      data: {
        total: blockedUsers.length,
        users: blockedUsers
      }
    });

  } catch (error) {
    console.error('Get blocked users error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve blocked users',
      data: null
    });
  }
};

export const unblockUser = async (req, res) => {
  try {
    const { userIdToUnblock } = req.body;
    const blockerId = req.user.userId;

    if (!userIdToUnblock) {
      return res.status(200).json({
        success: false,
        message: 'User ID is required',
        data: null
      });
    }

    const blocker = await User.findById(blockerId);

    if (!blocker) {
      return res.status(200).json({
        success: false,
        message: 'User not found',
        data: null
      });
    }

    if (!blocker.blockedUsers?.includes(userIdToUnblock)) {
      return res.status(200).json({
        success: false,
        message: 'User is not in your blocked list',
        data: null
      });
    }

    // Remove from blockedUsers array
    blocker.blockedUsers = blocker.blockedUsers.filter(
      id => id.toString() !== userIdToUnblock.toString()
    );

    await blocker.save();

    // Soft deactivate block report
    await BlockReport.findOneAndUpdate(
      {
        blockedBy: blockerId,
        blockedUser: userIdToUnblock,
        isActive: true
      },
      { isActive: false }
    );

    return res.status(200).json({
      success: true,
      message: 'User unblocked successfully',
      data: {
        unblockedUserId: userIdToUnblock
      }
    });

  } catch (error) {
    console.error('Unblock user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to unblock user',
      data: null
    });
  }
};