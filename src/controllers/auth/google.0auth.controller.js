import axios from "axios";
import User from "../../models/User.js";
import { generateTokenPair } from "../../utils/token.helper.js";

export const googleCallback = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect("/signin?error=google");

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

    // 2️⃣ Fetch Google profile
    const profileRes = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const { id, email, name, picture } = profileRes.data;

    // 3️⃣ Find or create user
    let user = await User.findOne({
      $or: [{ googleId: id }, { email: email.toLowerCase() }],
    });

    if (!user) {
      user = await User.create({
        name,
        email: email.toLowerCase(),
        googleId: id,
        avatar: picture,
        role: "customer",
        isEmailVerified: true,
      });
    }

    // 4️⃣ Generate tokens (reuse your system)
    const tokens = await generateTokenPair(user);

    // 5️⃣ Redirect to frontend with tokens
    res.redirect(
      `${process.env.FRONTEND_URL}/oauth-success?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`
    );
  } catch (err) {
    console.error("Google OAuth error:", err);
    res.redirect("/signin?error=google");
  }
};
