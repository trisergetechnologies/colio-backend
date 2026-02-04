import User from "../../models/User.js";
import { maskEmail } from "../../utils/mask.helper.js";
import { generateTokenPair } from "../../utils/token.helper.js";

export const googleRegister = async (req, res) => {
  try {
    const { name, email, googleId, avatar } = req.body;

    if (!googleId || !email) {
      return res.status(200).json({
        success: false,
        message: "Google ID and email are required",
        data: null,
      });
    }

    const normalizedEmail = email.toLowerCase();

    // Check existing user
    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { googleId }],
    });

    if (existingUser) {
      return res.status(200).json({
        success: false,
        message: "User already exists. Please sign in instead",
        data: null,
      });
    }

    // Create new user
    const user = await User.create({
      name: name || "Google User",
      email: normalizedEmail,
      googleId,
      isEmailVerified: true,
      registrationType: "google",
      role: "customer",
      avatar: avatar || null,
      wallet: { main: 75, bonus: 0 },
    });

    const tokens = await generateTokenPair(user);

    return res.status(200).json({
      success: true,
      message: "Registration successful",
      data: {
        userId: user._id,
        name: user.name,
        email: maskEmail(user.email),
        role: user.role,
        isVerified: user.isVerified,
        isEmailVerified: true,
        isPhoneVerified: false,
        avatar: user.avatar,
        wallet: user.wallet,
        ...tokens,
      },
    });
  } catch (err) {
    console.error("Google Register Error:", err);
    return res.status(500).json({
      success: false,
      message: "Registration failed. Please try again",
      data: null,
    });
  }
};