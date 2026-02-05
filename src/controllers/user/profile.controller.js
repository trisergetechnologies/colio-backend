// 11. GET  /api/user/profile              # getProfile()
// 12. PUT  /api/user/profile              # updateProfile()
// 13. POST /api/user/avatar               # uploadAvatar()
// 14. DELETE /api/user/avatar             # deleteAvatar()
// 15. PUT  /api/user/password             # updatePassword()


import User from '../../models/User.js';
import { hashPassword, comparePassword } from '../../utils/password.helper.js';
import { maskEmail, maskPhone } from '../../utils/mask.helper.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

/**
 * Get user profile
 * @route GET /api/user/profile
 * @desc Get current user's profile information
 * @access Private (Both customer & consultant)
 */
export const getProfile = async (req, res) => {
  try {
    const userId = req.user.userId; // From auth middleware

    // Find user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(200).json({
        success: false,
        message: 'User not found',
        data: null
      });
    }

    // Prepare response data based on role
    const responseData = {
      userId: user._id,
      name: user.name,
      email: maskEmail(user.email),
      phone: maskPhone(user.phone),
      role: user.role,
      avatar: user.avatar,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      languages: user.languages,
      isVerified: user.isVerified,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    };

    // Add role-specific data
    if (user.role === 'customer') {
      responseData.wallet = user.wallet;
      responseData.referralCode = user.referralCode;
      responseData.totalReferrals = user.totalReferrals;
      responseData.favoriteConsultants = user.favoriteConsultants;
    }

    if (user.role === 'consultant') {
      responseData.consultantProfile = user.consultantProfile;
    }

    return res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve profile',
      data: null
    });
  }
};

/**
 * Update user profile
 * @route PUT /api/user/profile
 * @desc Update user's profile information
 * @access Private (Both customer & consultant)
 */
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      name,
      gender,
      dateOfBirth,
      languages,
      // Consultant-specific fields
      bio,
      skills,
      ratePerMinute
    } = req.body;

    // Find user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(200).json({
        success: false,
        message: 'User not found',
        data: null
      });
    }

    // Update basic profile fields
    if (name !== undefined) {
      if (!name || name.trim().length < 2) {
        return res.status(200).json({
          success: false,
          message: 'Name must be at least 2 characters long',
          data: null
        });
      }
      user.name = name.trim();
    }

    if (gender !== undefined) {
      if (!['male', 'female', 'other'].includes(gender)) {
        return res.status(200).json({
          success: false,
          message: 'Invalid gender value',
          data: null
        });
      }
      user.gender = gender;
    }

    if (dateOfBirth !== undefined) {
      const birthDate = new Date(dateOfBirth);
      if (birthDate >= new Date()) {
        return res.status(200).json({
          success: false,
          message: 'Date of birth must be in the past',
          data: null
        });
      }
      user.dateOfBirth = birthDate;
    }

    if (languages !== undefined) {
      if (!Array.isArray(languages) || languages.some(lang => !['english', 'hindi','kannada', "marathi", "telugu", "bengali", "malayalam", "punjabi"].includes(lang))) {
        return res.status(200).json({
          success: false,
          message: 'Invalid languages. Only english and hindi are supported',
          data: null
        });
      }
      user.languages = languages;
    }

    // Update consultant-specific fields
    if (user.role === 'consultant') {
      if (bio !== undefined) {
        if (bio.length > 500) {
          return res.status(200).json({
            success: false,
            message: 'Bio cannot exceed 500 characters',
            data: null
          });
        }
        user.consultantProfile.bio = bio;
      }

      if (skills !== undefined) {
        const validSkills = [
          'active-listening', 'empathy', 'stress-management', 
          'relationship-advice', 'career-guidance', 'general-chat',
          'anxiety-support', 'motivation', 'life-coaching'
        ];
        if (!Array.isArray(skills) || skills.some(skill => !validSkills.includes(skill))) {
          return res.status(200).json({
            success: false,
            message: 'Invalid skills provided',
            data: null
          });
        }
        user.consultantProfile.skills = skills;
      }

      if (ratePerMinute !== undefined) {
        if (ratePerMinute < 1 || ratePerMinute > 100) {
          return res.status(200).json({
            success: false,
            message: 'Rate per minute must be between 1 and 100',
            data: null
          });
        }
        user.consultantProfile.ratePerMinute = ratePerMinute;
      }
    }

    await user.save();

    // Return updated profile
    const responseData = {
      userId: user._id,
      name: user.name,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      languages: user.languages
    };

    if (user.role === 'consultant') {
      responseData.consultantProfile = {
        bio: user.consultantProfile.bio,
        skills: user.consultantProfile.skills,
        ratePerMinute: user.consultantProfile.ratePerMinute
      };
    }

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      data: null
    });
  }
};

/**
 * Upload user avatar
 * @route POST /api/user/avatar
 * @desc Upload and update user's avatar image
 * @access Private (Both customer & consultant)
 */
export const uploadAvatar = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Configure multer for avatar upload
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadPath = 'uploads/avatars';
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
      },
      filename: (req, file, cb) => {
        const uniqueName = `${userId}_${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
      }
    });

    const upload = multer({
      storage: storage,
      limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
      },
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Invalid file type. Only JPEG, PNG, and GIF are allowed.'));
        }
      }
    }).single('avatar');

    upload(req, res, async (err) => {
      if (err) {
        return res.status(200).json({
          success: false,
          message: err.message || 'File upload failed',
          data: null
        });
      }

      if (!req.file) {
        return res.status(200).json({
          success: false,
          message: 'No file uploaded',
          data: null
        });
      }

      // Find user and update avatar
      const user = await User.findById(userId);
      
      if (!user) {
        // Delete uploaded file if user not found
        fs.unlinkSync(req.file.path);
        return res.status(200).json({
          success: false,
          message: 'User not found',
          data: null
        });
      }

      // Delete old avatar if exists
      if (user.avatar) {
        const oldAvatarPath = path.join('uploads/avatars', path.basename(user.avatar));
        if (fs.existsSync(oldAvatarPath)) {
          fs.unlinkSync(oldAvatarPath);
        }
      }

      // Update user avatar URL
      user.avatar = `/uploads/avatars/${req.file.filename}`;
      await user.save();

      return res.status(200).json({
        success: true,
        message: 'Avatar uploaded successfully',
        data: {
          avatar: user.avatar,
          uploadedAt: new Date().toISOString()
        }
      });
    });

  } catch (error) {
    console.error('Upload avatar error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload avatar',
      data: null
    });
  }
};

/**
 * Delete user avatar
 * @route DELETE /api/user/avatar
 * @desc Delete user's current avatar
 * @access Private (Both customer & consultant)
 */
export const deleteAvatar = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Find user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(200).json({
        success: false,
        message: 'User not found',
        data: null
      });
    }

    if (!user.avatar) {
      return res.status(200).json({
        success: false,
        message: 'No avatar to delete',
        data: null
      });
    }

    // Delete avatar file from filesystem
    const avatarPath = path.join('uploads/avatars', path.basename(user.avatar));
    if (fs.existsSync(avatarPath)) {
      fs.unlinkSync(avatarPath);
    }

    // Remove avatar reference from user
    user.avatar = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Avatar deleted successfully',
      data: null
    });

  } catch (error) {
    console.error('Delete avatar error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete avatar',
      data: null
    });
  }
};

/**
 * Update user password
 * @route PUT /api/user/password
 * @desc Update user's password
 * @access Private (Both customer & consultant)
 */
export const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    if (!currentPassword || !newPassword) {
      return res.status(200).json({
        success: false,
        message: 'Current password and new password are required',
        data: null
      });
    }

    if (newPassword.length < 6) {
      return res.status(200).json({
        success: false,
        message: 'New password must be at least 6 characters long',
        data: null
      });
    }

    // Find user with password
    const user = await User.findById(userId).select('+password');
    
    if (!user) {
      return res.status(200).json({
        success: false,
        message: 'User not found',
        data: null
      });
    }

    // For Google OAuth users without password
    if (user.googleId && !user.password) {
      user.password = await hashPassword(newPassword);
      await user.save();

      return res.status(200).json({
        success: true,
        message: 'Password set successfully',
        data: null
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await comparePassword(currentPassword, user.password);
    
    if (!isCurrentPasswordValid) {
      return res.status(200).json({
        success: false,
        message: 'Current password is incorrect',
        data: null
      });
    }

    // Check if new password is different
    const isSamePassword = await comparePassword(newPassword, user.password);
    
    if (isSamePassword) {
      return res.status(200).json({
        success: false,
        message: 'New password must be different from current password',
        data: null
      });
    }

    // Update password
    user.password = await hashPassword(newPassword);
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully',
      data: null
    });

  } catch (error) {
    console.error('Update password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update password',
      data: null
    });
  }
};