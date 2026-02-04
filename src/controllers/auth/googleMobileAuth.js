// controllers/auth/googleMobileAuth.js
import User from "../../models/User.js";
import { maskEmail } from "../../utils/mask.helper.js";
import { generateTokenPair } from "../../utils/token.helper.js";

export const googleMobileAuth = async (req, res) => {
  try {
    const { googleId, email, name, avatar } = req.body;

    if (!googleId || !email) {
      return res.status(200).json({
        success: false,
        message: "Google ID and email are required",
        data: null,
      });
    }

    const normalizedEmail = email.toLowerCase();

    // Find user by googleId or email
    let user = await User.findOne({
      $or: [{ googleId }, { email: normalizedEmail }],
    });

    // Case 1: User exists with Google ID → Login
    if (user && user.googleId) {
      if (!user.isActive) {
        return res.status(200).json({
          success: false,
          message: "Your account has been deactivated",
          data: null,
        });
      }

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
    }

    // Case 2: User exists but no Google ID → Link and Login
    if (user && !user.googleId) {
      user.googleId = googleId;
      user.isEmailVerified = true;
      if (!user.avatar && avatar) user.avatar = avatar;
      user.lastLogin = new Date();
      await user.save();

      const tokens = await generateTokenPair(user);

      return res.status(200).json({
        success: true,
        message: "Google account linked successfully",
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
    }

    // Case 3: New user → Register
    user = await User.create({
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
    console.error("Google Mobile Auth Error:", err);
    return res.status(500).json({
      success: false,
      message: "Google authentication failed. Please try again",
      data: null,
    });
  }
};