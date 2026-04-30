import mongoose from "mongoose";
import CommunicationSession from "../../models/CommunicationSession.js";
import User, {
  CONSULTANT_CATEGORIES,
  CONSULTANT_SKILLS,
} from "../../models/User.js";
import settingsService from "../../services/settingsService.js";
import { uploadImageAndGetUrl } from "../../services/mediaStorage.service.js";
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
            category,
            skills,
            onboardingScore,

            ratePerMinute,
            ratePerMinuteVideo,
            ratePerMinuteChat,

            bankDetails,

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

        if (!category || !CONSULTANT_CATEGORIES.includes(category)) {
            return res.json({
                success: false,
                message:
                    'Valid listener category is required (Loneliness, Breakup, Feeling Low, Stress, Overthinking)',
            });
        }

        let sanitizedSkills = [];
        if (skills !== undefined && skills !== null) {
            if (!Array.isArray(skills)) {
                return res.json({
                    success: false,
                    message: 'Skills must be an array of allowed skill keys',
                });
            }
            sanitizedSkills = skills.filter(
                (s) => typeof s === 'string' && CONSULTANT_SKILLS.includes(s),
            );
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
                category,
                skills: sanitizedSkills,
                onboardingScore,
                ratingAverage: 0,
                ratingCount: 0,
                totalSessions: 0,

                ratePerMinute: defaultAudioRate,
                ratePerMinuteVideo: ratePerMinuteVideo ?? 25,
                ratePerMinuteChat: ratePerMinuteChat ?? 10,

                bankDetails: {
                  accountHolderName: bankDetails?.accountHolderName || '',
                  bankName: bankDetails?.bankName || '',
                  accountNumber: bankDetails?.accountNumber || '',
                  ifscCode: bankDetails?.ifscCode || '',
                  upiId: bankDetails?.upiId || '',
                  isVerified: true,
                  verifiedAt: Date.now()
                },

                availabilityStatus,
                applicationStatus: 'approved',
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
                availabilityStatus: consultant.consultantProfile.availabilityStatus,
                category: consultant.consultantProfile.category
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

    if (updates.category !== undefined) {
      if (!CONSULTANT_CATEGORIES.includes(updates.category)) {
        return res.json({
          success: false,
          message:
            'Invalid listener category. Allowed: Loneliness, Breakup, Feeling Low, Stress, Overthinking',
        });
      }
    }

    if (updates.skills !== undefined) {
      if (!Array.isArray(updates.skills)) {
        return res.json({
          success: false,
          message: 'Skills must be an array',
        });
      }
      updates.skills = updates.skills.filter(
        (s) => typeof s === 'string' && CONSULTANT_SKILLS.includes(s),
      );
    }

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
      'category',
      'skills',
      'onboardingScore',
      'ratePerMinute',
      'ratePerMinuteVideo',
      'ratePerMinuteChat',
      'availabilityStatus',
      'bankDetails',
      'applicationStatus',
      'rejectionReason',
    ];

    consultantFields.forEach(field => {
      if (updates[field] !== undefined) {

      // special handling for bankDetails (nested merge)
      if (field === 'bankDetails') {
        consultant.consultantProfile.bankDetails = {
          ...consultant.consultantProfile.bankDetails,
          ...updates.bankDetails
        };

        // auto verification timestamp logic
        if (updates.bankDetails?.isVerified === true) {
          consultant.consultantProfile.bankDetails.verifiedAt = new Date();
        }
      } else {
      consultant.consultantProfile[field] = updates[field];
      }
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

export const uploadConsultantAvatarByAdmin = async (req, res) => {
  try {
    const admin = req.user;

    // 🔐 Admin guard
    if (admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access',
      });
    }

    const { consultantId } = req.body;

    if (!consultantId) {
      return res.json({
        success: false,
        message: 'Consultant ID is required',
      });
    }

    if (!req.file) {
      return res.json({
        success: false,
        message: 'Avatar image is required',
      });
    }

    const consultant = await User.findById(consultantId);

    if (!consultant) {
      return res.json({
        success: false,
        message: 'Consultant not found',
      });
    }

    if (consultant.role !== 'consultant') {
      return res.json({
        success: false,
        message: 'User is not a consultant',
      });
    }

    const avatarUrl = await uploadImageAndGetUrl({
      req,
      file: req.file,
      folder: "colio/consultant_avatars",
      fallbackPath: `consultant_avatars/${req.file.filename}`,
    });

    consultant.avatar = avatarUrl;
    await consultant.save();

    return res.json({
      success: true,
      message: 'Consultant avatar uploaded successfully',
      data: {
        consultantId: consultant._id,
        avatar: consultant.avatar,
      },
    });
  } catch (error) {
    console.error('Upload consultant avatar error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to upload consultant avatar',
    });
  }
};


const formatSession = (s) => {
  const durationMinutes = Math.ceil((s.totalDurationSeconds || 0) / 60);

  return {
    sessionId: s._id,

    type: s.type,
    status: s.status,

    participants: {
      customer: s.customer,
      consultant: s.consultant,
    },

    timeline: {
      createdAt: toIST(s.createdAt),
      startedAt: toIST(s.startedAt),
      endedAt: toIST(s.endedAt),
      lastBilledAt: toIST(s.lastBilledAt),
    },

    duration: {
      seconds: s.totalDurationSeconds,
      minutes: durationMinutes,
    },

    billing: {
      ratePerMinute: s.ratePerMinute,
      billedMinutes: s.billedMinutes,
      billedAmount: s.billedAmount,
      bonusUsed: s.bonusUsed,
      isBilled: s.isBilled,
    },

    earnings: {
      consultantEarning: s.consultantEarning,
      systemEarning: s.systemEarning,
    },

    termination: {
      endedBy: s.endedBy,
      autoEnded: s.autoEnded,
      reason: s.endReason,
    },

    agora: {
      channelName: s.agora?.channelName,
      conversationId: s.agora?.chatConversationId,
    },

    quality: {
      network: s.networkQuality,
      deviceInfo: s.deviceInfo,
    },
  };
};



const toIST = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: true,
  });
};

export const getSessionDetails = async (req, res) => {
  try {
    const {
      sessionId,
      page = 1,
      limit = 10,
      type,
      status,
      customerId,
      consultantId,
    } = req.query;

    // ================= SINGLE SESSION =================
    if (sessionId) {
      if (!mongoose.Types.ObjectId.isValid(sessionId)) {
        return res.json({
          success: false,
          message: "Invalid sessionId",
        });
      }

      const session = await CommunicationSession.findById(sessionId)
        .populate("customer", "name email phone avatar role")
        .populate(
          "consultant",
          "name email phone avatar role consultantProfile"
        )
        .populate("endedBy", "name role");

      if (!session || session.totalDurationSeconds === 0) {
        return res.json({
          success: false,
          message: "Session not found",
        });
      }

      return res.json({
        success: true,
        data: formatSession(session),
      });
    }

    // ================= BULK FETCH =================
    const query = {
      totalDurationSeconds: { $gt: 0 },
    };

    if (type) query.type = type;
    if (status) query.status = status;
    if (customerId) query.customer = customerId;
    if (consultantId) query.consultant = consultantId;

    const skip = (Number(page) - 1) * Number(limit);

    const [sessions, total] = await Promise.all([
      CommunicationSession.find(query)
        .populate("customer", "name email phone avatar role")
        .populate(
          "consultant",
          "name email phone avatar role consultantProfile"
        )
        .populate("endedBy", "name role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      CommunicationSession.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: {
        items: sessions.map(formatSession),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Get session details error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch session details",
    });
  }
};

export const approveConsultant = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Unauthorized access" });
    }

    const { consultantId } = req.params;
    const {
      onboardingScore,
      ratePerMinute,
      ratePerMinuteVideo,
      ratePerMinuteChat,
    } = req.body;

    const nums = [onboardingScore, ratePerMinute, ratePerMinuteVideo, ratePerMinuteChat];
    if (nums.some((n) => n === undefined || n === null || Number.isNaN(Number(n)))) {
      return res.json({
        success: false,
        message:
          "onboardingScore, ratePerMinute, ratePerMinuteVideo, and ratePerMinuteChat are required",
      });
    }

    const consultant = await User.findOne({
      _id: consultantId,
      role: "consultant",
    });

    if (!consultant) {
      return res.json({ success: false, message: "Consultant not found" });
    }

    const st = consultant.consultantProfile?.applicationStatus ?? "approved";
    if (st !== "pending_approval") {
      return res.json({
        success: false,
        message: "Consultant is not pending approval",
      });
    }

    if (!consultant.consultantProfile?.agreement?.signed) {
      return res.json({
        success: false,
        message: "Host agreement has not been signed by this expert",
      });
    }

    consultant.isActive = true;
    consultant.isVerified = true;
    consultant.isEmailVerified = true;
    consultant.isPhoneVerified = true;
    consultant.consultantProfile.applicationStatus = "approved";
    consultant.consultantProfile.onboardingScore = Number(onboardingScore);
    consultant.consultantProfile.ratePerMinute = Number(ratePerMinute);
    consultant.consultantProfile.ratePerMinuteVideo = Number(ratePerMinuteVideo);
    consultant.consultantProfile.ratePerMinuteChat = Number(ratePerMinuteChat);
    consultant.consultantProfile.bankDetails = {
      ...consultant.consultantProfile.bankDetails,
      isVerified: true,
      verifiedAt: new Date(),
    };

    await consultant.save();

    return res.json({
      success: true,
      message: "Consultant approved",
      data: {
        consultantId: consultant._id,
        name: consultant.name,
        applicationStatus: consultant.consultantProfile.applicationStatus,
        rates: {
          audio: consultant.consultantProfile.ratePerMinute,
          video: consultant.consultantProfile.ratePerMinuteVideo,
          chat: consultant.consultantProfile.ratePerMinuteChat,
        },
      },
    });
  } catch (error) {
    console.error("approveConsultant error:", error);
    return res.status(500).json({ success: false, message: "Approval failed" });
  }
};

export const rejectConsultant = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Unauthorized access" });
    }

    const { consultantId } = req.params;
    const { rejectionReason } = req.body;

    const consultant = await User.findOne({
      _id: consultantId,
      role: "consultant",
    });

    if (!consultant) {
      return res.json({ success: false, message: "Consultant not found" });
    }

    const st = consultant.consultantProfile?.applicationStatus ?? "approved";
    if (st !== "pending_approval") {
      return res.json({
        success: false,
        message: "Consultant is not pending approval",
      });
    }

    consultant.isActive = false;
    consultant.consultantProfile.applicationStatus = "rejected";
    consultant.consultantProfile.rejectionReason = rejectionReason?.trim() || "";

    await consultant.save();

    return res.json({
      success: true,
      message: "Application rejected",
      data: { consultantId: consultant._id },
    });
  } catch (error) {
    console.error("rejectConsultant error:", error);
    return res.status(500).json({ success: false, message: "Rejection failed" });
  }
};
