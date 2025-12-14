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
        data: null
      });
    }

    // 1️⃣ Exchange code → access token
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
        data: null
      });
    }

    // 2️⃣ Fetch Google profile
    const profileRes = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    console.log("[googleOAuth]", profileRes);

    const { id: googleId, email, name, picture } = profileRes.data;

    if (!email || !googleId) {
      return res.status(200).json({
        success: false,
        message: "Google account does not provide email",
        data: null
      });
    }

    // 3️⃣ Does this Google user already exist?
    let existingUser = await User.findOne({ googleId });

    if (existingUser) {
      // 4️⃣ Existing user → Login
      req.body = {
        identifier: email.toLowerCase(),
        googleId,
        loginType: "google",
        role: existingUser.role
      };

      return googleLogin(req, res);
    }

    // 5️⃣ User does not exist → Register
    req.body = {
      name: name || "Google User",
      email: email.toLowerCase(),
      googleId,
      registrationType: "google",
      role: "customer",
      avatar: picture
    };

    return googleRegister(req, res);

  } catch (err) {
    console.error("Google OAuth Error:", err?.response?.data || err);
    return res.status(500).json({
      success: false,
      message: "Google OAuth failed",
      data: null
    });
  }
};
