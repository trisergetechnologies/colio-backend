import User from "../../models/User.js";
import settingsService from "../../services/settingsService.js";
import { hashPassword, validatePasswordStrength } from "../../utils/password.helper.js";

export const onboardConsultantByAdmin = async (req, res) => {
    try {
        const admin = req.user;

        // 🔐 Admin guard
        if (admin.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access'
            });
        }

        const {
            name,
            email,
            phone,
            password,
            gender,
            dateOfBirth,
            languages,

            bio,
            skills,
            onboardingScore,

            ratePerMinute,
            ratePerMinuteVideo,
            ratePerMinuteChat,

            availabilityStatus = 'offWork',
            isActive = true,
            isVerified = true
        } = req.body;

        // ================== VALIDATION ==================
        if (!name || name.trim().length < 2) {
            return res.json({ success: false, message: 'Invalid name' });
        }

        if (!email || !phone || !password) {
            return res.json({
                success: false,
                message: 'Email, phone and password are required'
            });
        }

        const passwordCheck = validatePasswordStrength(password);
        if (!passwordCheck.isValid) {
            return res.json({
                success: false,
                message: passwordCheck.message
            });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });

        if (existingUser) {
            return res.json({
                success: false,
                message: 'Consultant with email already exists'
            });
        }

        // ================== PASSWORD ==================
        const hashedPassword = await hashPassword(password);

        // ================== DEFAULT RATES ==================
        const defaultAudioRate =
            ratePerMinute ??
            (await settingsService.getSetting('financial.defaultConsultantRatePerMinute'));

        // ================== CREATE CONSULTANT ==================
        const consultant = await User.create({
            name: name.trim(),
            email: email.toLowerCase(),
            phone,
            password: hashedPassword,
            role: 'consultant',

            gender,
            dateOfBirth,
            languages,

            isActive,
            isVerified,
            isEmailVerified: true,
            isPhoneVerified: true,

            consultantProfile: {
                bio: bio || '',
                skills: skills || [],
                onboardingScore,
                ratingAverage: 0,
                ratingCount: 0,
                totalSessions: 0,

                ratePerMinute: defaultAudioRate,
                ratePerMinuteVideo: ratePerMinuteVideo ?? 25,
                ratePerMinuteChat: ratePerMinuteChat ?? 10,

                availabilityStatus,
                wallet: {
                    available: 0,
                    pending: 0,
                    totalEarned: 0
                }
            },

            wallet: {
                main: 0,
                bonus: 0
            }
        });

        return res.json({
            success: true,
            message: 'Consultant onboarded successfully',
            data: {
                consultantId: consultant._id,
                name: consultant.name,
                email: consultant.email,
                phone: consultant.phone,
                rates: {
                    audio: consultant.consultantProfile.ratePerMinute,
                    video: consultant.consultantProfile.ratePerMinuteVideo,
                    chat: consultant.consultantProfile.ratePerMinuteChat
                },
                availabilityStatus: consultant.consultantProfile.availabilityStatus
            }
        });
    } catch (error) {
        console.error('Admin consultant onboarding error:', error);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            return res.json({ success: false, message: messages.join(', ') });
        }

        if (error.code === 11000) {
            return res.json({
                success: false,
                message: 'Duplicate consultant detected'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Consultant onboarding failed'
        });
    }
};

export const updateConsultantByAdmin = async (req, res) => {
  try {
    // 🔐 Admin guard
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    const { consultantId } = req.params;
    const updates = req.body;

    // ================= BLOCKED FIELDS =================
    const blockedFields = [
      'avatar',
      'password',
      'wallet',
      'role',
      'googleId',
      'loginAttempts',
      'lockUntil'
    ];

    blockedFields.forEach(field => delete updates[field]);

    // ================= FIND CONSULTANT =================
    const consultant = await User.findOne({
      _id: consultantId,
      role: 'consultant'
    });

    if (!consultant) {
      return res.json({
        success: false,
        message: 'Consultant not found'
      });
    }

    // ================= BASIC FIELDS =================
    const basicFields = [
      'name',
      'email',
      'phone',
      'gender',
      'dateOfBirth',
      'languages',
      'isActive',
      'isVerified'
    ];

    basicFields.forEach(field => {
      if (updates[field] !== undefined) {
        consultant[field] = updates[field];
      }
    });

    // ================= CONSULTANT PROFILE =================
    const consultantFields = [
      'bio',
      'skills',
      'onboardingScore',
      'ratePerMinute',
      'ratePerMinuteVideo',
      'ratePerMinuteChat',
      'availabilityStatus'
    ];

    consultantFields.forEach(field => {
      if (updates[field] !== undefined) {
        consultant.consultantProfile[field] = updates[field];
      }
    });

    // ================= SAVE =================
    await consultant.save();

    return res.json({
      success: true,
      message: 'Consultant updated successfully',
      data: {
        consultantId: consultant._id,
        name: consultant.name,
        isActive: consultant.isActive,
        availabilityStatus: consultant.consultantProfile.availabilityStatus,
        rates: {
          audio: consultant.consultantProfile.ratePerMinute,
          video: consultant.consultantProfile.ratePerMinuteVideo,
          chat: consultant.consultantProfile.ratePerMinuteChat
        }
      }
    });

  } catch (error) {
    console.error('Admin update consultant error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.json({
        success: false,
        message: messages.join(', ')
      });
    }

    if (error.code === 11000) {
      return res.json({
        success: false,
        message: 'Email or phone already exists'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to update consultant'
    });
  }
};