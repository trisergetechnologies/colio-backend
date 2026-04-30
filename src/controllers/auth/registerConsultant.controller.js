import User from '../../models/User.js';
import settingsService from '../../services/settingsService.js';
import { hashPassword, validatePasswordStrength } from '../../utils/password.helper.js';
import { generateTokenPair } from '../../utils/token.helper.js';
import { maskEmail, maskPhone } from '../../utils/mask.helper.js';

/**
 * Self-service expert registration (pending onboarding until admin approval).
 * POST /api/auth/register-consultant
 */
export const registerConsultant = async (req, res) => {
  try {
    const { name, email, phone, password, confirmPassword } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(200).json({
        success: false,
        message: 'Name must be at least 2 characters',
        data: null,
      });
    }

    if (!email || !phone || !password) {
      return res.status(200).json({
        success: false,
        message: 'Email, phone and password are required',
        data: null,
      });
    }

    if (password !== confirmPassword) {
      return res.status(200).json({
        success: false,
        message: 'Password and confirm password do not match',
        data: null,
      });
    }

    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.isValid) {
      return res.status(200).json({
        success: false,
        message: passwordCheck.message,
        data: null,
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase().trim() }, { phone: String(phone).trim() }],
    });

    if (existingUser) {
      const field =
        existingUser.email === email.toLowerCase().trim() ? 'email' : 'phone';
      return res.status(200).json({
        success: false,
        message: `User with this ${field} already exists`,
        data: null,
      });
    }

    const defaultRate = await settingsService.getSetting(
      'financial.defaultConsultantRatePerMinute'
    );

    const hashedPassword = await hashPassword(password);

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: String(phone).trim(),
      password: hashedPassword,
      role: 'consultant',
      isActive: false,
      isVerified: false,
      isEmailVerified: false,
      isPhoneVerified: false,
      wallet: {
        main: 0,
        bonus: 0,
      },
      consultantProfile: {
        bio: '',
        category: 'Stress',
        skills: [],
        ratingAverage: 0,
        ratingCount: 0,
        totalSessions: 0,
        onboardingScore: 0,
        ratePerMinute: defaultRate ?? 5,
        ratePerMinuteVideo: 10,
        ratePerMinuteChat: 10,
        availabilityStatus: 'offWork',
        applicationStatus: 'pending_profile',
        wallet: {
          available: 0,
          pending: 0,
          totalEarned: 0,
        },
        agreement: {
          signed: false,
        },
      },
    });

    const tokens = await generateTokenPair(user);

    const responseData = {
      userId: user._id,
      name: user.name,
      role: user.role,
      isVerified: user.isVerified,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      isActive: user.isActive,
      email: maskEmail(user.email),
      phone: maskPhone(user.phone),
      consultantProfile: {
        availabilityStatus: user.consultantProfile.availabilityStatus,
        ratePerMinute: user.consultantProfile.ratePerMinute,
        applicationStatus: user.consultantProfile.applicationStatus,
      },
      ...tokens,
    };

    return res.status(200).json({
      success: true,
      message: 'Registration successful. Complete your profile to continue.',
      data: responseData,
    });
  } catch (error) {
    console.error('Register consultant error:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(200).json({
        success: false,
        message: errors.join(', '),
        data: null,
      });
    }

    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(200).json({
        success: false,
        message: `User with this ${field} already exists`,
        data: null,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.',
      data: null,
    });
  }
};
