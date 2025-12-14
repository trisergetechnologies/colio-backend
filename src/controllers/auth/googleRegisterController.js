import User from "../../models/User.js";
import settingsService from "../../services/settingsService.js";
import { maskEmail } from "../../utils/mask.helper.js";
import { generateToken } from "../../utils/token.helper.js";

export const googleRegister = async (req, res) => {
  try {
    const { name, email, googleId } = req.body;

    if (!googleId || !email) {
      return res.status(200).json({
        success: false,
        message: "Google ID and email are required",
        data: null
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { googleId }]
    });

    if (existingUser) {
      return res.status(200).json({
        success: false,
        message: "User already exists. Please login with Google.",
        data: null
      });
    }

    // Create user (phone will be added later via OTP)
    const user = await User.create({
      name,
      email,
      googleId,
      isEmailVerified: true,
      registrationType: "google",
      role: "customer",
      wallet: { main: 0, bonus: 0 }
    });

    // Generate token
    const accessTokenExpiry = await settingsService.getSetting("auth.accessTokenExpiryMinutes");
    const token = generateToken(
      { userId: user._id, role: user.role, isVerified: user.isVerified },
      `${accessTokenExpiry}m`
    );

    return res.status(200).json({
      success: true,
      message: "Google registration successful",
      data: {
        userId: user._id,
        name: user.name,
        role: user.role,
        isVerified: user.isVerified,
        isEmailVerified: true,
        token,
        email: maskEmail(user.email)
      }
    });

  } catch (err) {
    console.error("Google Register Error:", err);
    return res.status(500).json({ success: false, message: "Registration failed", data: null });
  }
};
