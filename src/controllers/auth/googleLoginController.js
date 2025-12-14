import User from "../../models/User.js";
import { maskEmail } from "../../utils/mask.helper.js";
import { generateTokenPair } from "../../utils/token.helper.js";

export const googleLogin = async (req, res) => {
  try {
    const { email, googleId } = req.body;
    console.log("[googleLogin]", "email: ",email,"googleId: ",googleId);

    if (!googleId || !email) {
      return res.status(200).json({
        success: false,
        message: "Google ID and email are required",
        data: null
      });
    }

    const user = await User.findOne({ googleId });

    if (!user) {
      return res.status(200).json({
        success: false,
        message: "Google account not registered",
        data: null
      });
    }

    if (!user.isActive) {
      return res.status(200).json({
        success: false,
        message: "Account deactivated",
        data: null
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Token pair
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
        email: maskEmail(user.email)
      }
    });

  } catch (err) {
    console.error("Google Login Error:", err);
    return res.status(500).json({ success: false, message: "Login failed", data: null });
  }
};
