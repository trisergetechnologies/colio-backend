// src/controllers/pushController.js
import User from "../../models/User.js";

/**
 * Save Expo push token for logged-in user
 * POST /api/user/push-token
 * Body: { pushToken }
 */
export const updatePushToken = async (req, res) => {
  try {
    const pushToken = req.body?.pushToken;

    if (!pushToken) {
      return res.status(200).json({
        success: false,
        message: "pushToken is required",
      });
    }

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: user not found in token",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: "User not found",
      });
    }

    user.fcmToken = pushToken; // using existing field
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Expo push token saved successfully",
      data: { pushToken },
    });
  } catch (error) {
    console.error("updatePushToken error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while saving push token",
    });
  }
};
