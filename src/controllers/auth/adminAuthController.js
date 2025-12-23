import User from "../../models/User.js";
import settingsService from "../../services/settingsService.js";
import { maskEmail } from "../../utils/mask.helper.js";
import { comparePassword } from "../../utils/password.helper.js";
import { generateTokenPair } from "../../utils/token.helper.js";

export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ================= INPUT VALIDATION =================
    if (!email || !password) {
      return res.status(200).json({
        success: false,
        message: 'Email and password are required',
        data: null
      });
    }

    // ================= FETCH ADMIN =================
    const admin = await User.findOne({
      email: email.toLowerCase(),
      role: 'admin'
    }).select('+password');

    if (!admin) {
      return res.status(200).json({
        success: false,
        message: 'Invalid credentials',
        data: null
      });
    }

    // ================= ACCOUNT STATUS =================
    if (admin.isAccountLocked) {
      const lockTime = await settingsService.getSetting('auth.accountLockoutMinutes');
      return res.status(200).json({
        success: false,
        message: `Account is locked. Try again after ${lockTime} minutes.`,
        data: null
      });
    }

    if (!admin.isActive) {
      return res.status(200).json({
        success: false,
        message: 'Admin account is deactivated',
        data: null
      });
    }

    // ================= PASSWORD CHECK =================
    const isValidPassword = await comparePassword(password, admin.password);

    if (!isValidPassword) {
      await admin.incLoginAttempts();
      return res.status(200).json({
        success: false,
        message: 'Invalid credentials',
        data: null
      });
    }

    await admin.resetLoginAttempts();

    // ================= UPDATE LOGIN =================
    admin.lastLogin = new Date();
    await admin.save();

    // ================= TOKENS =================
    const tokens = await generateTokenPair(admin);

    // ================= RESPONSE =================
    return res.status(200).json({
      success: true,
      message: 'Admin login successful',
      data: {
        adminId: admin._id,
        name: admin.name,
        email: maskEmail(admin.email),
        role: admin.role,
        avatar: admin.avatar,
        ...tokens
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Admin login failed',
      data: null
    });
  }
};
