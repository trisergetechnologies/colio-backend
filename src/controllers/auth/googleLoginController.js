import User from "../../models/User.js";
import { maskEmail } from "../../utils/mask.helper.js";
import { generateTokenPair } from "../../utils/token.helper.js";

export const googleLogin = async (req, res) => {
  try {
    const { email, googleId } = req.body;

    if (!googleId || !email) {
      return res.status(200).json({
        success: false,
        message: "Google ID and email are required",
        data: null,
      });
    }

    const normalizedEmail = email.toLowerCase();

    // Find by googleId first, then by email
    let user = await User.findOne({
      $or: [{ googleId }, { email: normalizedEmail }],
    });

    if (!user) {
      return res.status(200).json({
        success: false,
        message: "Account not found. Please register first",
        data: null,
      });
    }

    // Link Google ID if missing
    if (!user.googleId) {
      user.googleId = googleId;
      user.isEmailVerified = true;
      await user.save();
    }

    if (!user.isActive) {
      return res.status(200).json({
        success: false,
        message: "Your account has been deactivated",
        data: null,
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const tokens = await generateTokenPair(user);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        userId: user._id,
        name: user.name,
        email: maskEmail(user.email),
        role: user.role,
        isVerified: user.isVerified,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified || false,
        avatar: user.avatar,
        wallet: user.wallet,
        ...tokens,
      },
    });
  } catch (err) {
    console.error("Google Login Error:", err);
    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again",
      data: null,
    });
  }
};