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

    // 1) Try find by googleId
    let user = await User.findOne({ googleId });

    if (!user) {
      // 2) googleId missing, check by email
      user = await User.findOne({ email: email.toLowerCase() });

      if (!user) {
        return res.status(200).json({
          success: false,
          message: "Google account not registered",
          data: null,
        });
      }

      // 3) Link googleId to existing email-based user
      user.googleId = googleId;
      await user.save();
    }

    if (!user.isActive) {
      return res.status(200).json({
        success: false,
        message: "Account deactivated",
        data: null,
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const tokens = await generateTokenPair(user);

    return res.status(200).json({
      success: true,
      message: "Google login successful",
      data: {
        userId: user._id,
        name: user.name,
        role: user.role,
        isVerified: user.isVerified,
        isEmailVerified: user.isEmailVerified,
        avatar: user.avatar,
        loginType: "google",
        ...tokens,
        email: maskEmail(user.email),
      },
    });
  } catch (err) {
    console.error("Google Login Error:", err);
    return res.status(500).json({
      success: false,
      message: "Login failed",
      data: null,
    });
  }
};