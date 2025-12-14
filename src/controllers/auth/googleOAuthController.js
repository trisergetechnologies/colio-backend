import axios from "axios";
import User from "../../models/User.js";
import { googleLogin } from "./googleLoginController.js";
import { googleRegister } from "./googleRegisterController.js";

export const googleOAuth = async (req, res) => {
  try {
    const code = req.query.code;

    if (!code) {
      return res.status(200).json({
        success: false,
        message: "Authorization code is required",
        data: null,
      });
    }

    // 1) Exchange code → access token
    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      {
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }
    );

    const accessToken = tokenRes.data.access_token;

    if (!accessToken) {
      return res.status(200).json({
        success: false,
        message: "Failed to obtain Google access token",
        data: null,
      });
    }

    // 2) Get google profile
    const profileRes = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const { id: googleId, email, name, picture } = profileRes.data;

    if (!email || !googleId) {
      return res.status(200).json({
        success: false,
        message: "Google account does not provide email",
        data: null,
      });
    }

    // 3) Check for googleId first
    let user = await User.findOne({ googleId });

    if (user) {
      // Google ID exists → login
      req.body = { email, googleId };
      return googleLogin(req, res);
    }

    // 4) GoogleId not found → Check by email
    user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      // Email exists → link googleId to existing user
      user.googleId = googleId;
      await user.save();

      req.body = { email, googleId };
      return googleLogin(req, res);
    }

    // 5) No googleId & no email → register new user
    req.body = {
      name: name || "Google User",
      email: email.toLowerCase(),
      googleId,
      registrationType: "google",
      role: "customer",
      avatar: picture,
    };

    return googleRegister(req, res);

  } catch (err) {
    console.error("Google OAuth Error:", err?.response?.data || err);
    return res.status(500).json({
      success: false,
      message: "Google OAuth failed",
      data: null,
    });
  }
};
