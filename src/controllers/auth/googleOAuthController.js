import axios from "axios";
import User from "../../models/User.js";
import { maskEmail } from "../../utils/mask.helper.js";
import { generateTokenPair } from "../../utils/token.helper.js";

export const googleOAuth = async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(200).json({
        success: false,
        message: "Authorization code is required",
        data: null,
      });
    }

    // Exchange code for access token
    let tokenRes;
    try {
      tokenRes = await axios.post("https://oauth2.googleapis.com/token", {
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      });
    } catch (tokenErr) {
      // Handle invalid_grant specifically
      if (tokenErr?.response?.data?.error === 'invalid_grant') {
        return res.status(200).json({
          success: false,
          message: "Authorization code expired or already used. Please try signing in again",
          data: null,
        });
      }
      throw tokenErr;
    }

    const { access_token } = tokenRes.data;

    if (!access_token) {
      return res.status(200).json({
        success: false,
        message: "Failed to obtain access token from Google",
        data: null,
      });
    }

    // Get Google profile
    const profileRes = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    const { id: googleId, email, name, picture } = profileRes.data;

    if (!email || !googleId) {
      return res.status(200).json({
        success: false,
        message: "Google account does not provide required information",
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
      if (!user.avatar) user.avatar = picture;
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
      avatar: picture,
      wallet: { main: 0, bonus: 0 },
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
    console.error("Google OAuth Error:", err?.response?.data || err);
    return res.status(500).json({
      success: false,
      message: "Google authentication failed. Please try again",
      data: null,
    });
  }
};