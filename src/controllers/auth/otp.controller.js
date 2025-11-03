// 8. POST /api/auth/otp/send              # sendOTP()
// 9. POST /api/auth/otp/verify            # verifyOTP()
// 10. POST /api/auth/otp/resend           # resendOTP()


import User from '../../models/User.js';
import OTP from '../../models/OTP.js';
import settingsService from '../../services/settingsService.js';
import { maskEmail, maskPhone } from '../../utils/mask.helper.js';
import nodemailer from 'nodemailer';

/**
 * Send OTP
 * @route POST /api/auth/otp/send
 * @desc Send OTP to email or phone
 * @access Public
 */
export const sendOTP = async (req, res) => {
  try {
    const { 
      identifier, // email or phone
      type, // 'email' or 'phone'
      userId // optional - for logged in users
    } = req.body;

    // Input validation
    if (!identifier || !type) {
      return res.status(200).json({
        success: false,
        message: 'Identifier and type are required',
        data: null
      });
    }

    if (!['email', 'phone'].includes(type)) {
      return res.status(200).json({
        success: false,
        message: 'Type must be either email or phone',
        data: null
      });
    }

    // Validate identifier format
    if (type === 'email') {
      const emailRegex = /^\S+@\S+\.\S+$/;
      if (!emailRegex.test(identifier)) {
        return res.status(200).json({
          success: false,
          message: 'Invalid email format',
          data: null
        });
      }
    }

    if (type === 'phone') {
      const phoneRegex = /^[+]?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(identifier)) {
        return res.status(200).json({
          success: false,
          message: 'Invalid phone number format',
          data: null
        });
      }
    }

    // Check if user exists (optional check)
    let user = null;
    if (userId) {
      user = await User.findById(userId);
    } else {
      // Find user by identifier
      const query = type === 'email' 
        ? { email: identifier.toLowerCase() }
        : { phone: identifier };
      user = await User.findOne(query);
    }

    // Check if already verified (if user exists)
    if (user) {
      if (type === 'email' && user.isEmailVerified) {
        return res.status(200).json({
          success: false,
          message: 'Email is already verified',
          data: null
        });
      }
      
      if (type === 'phone' && user.isPhoneVerified) {
        return res.status(200).json({
          success: false,
          message: 'Phone number is already verified',
          data: null
        });
      }
    }

    // Check rate limiting - max OTPs per identifier
    const recentOTPs = await OTP.countDocuments({
      identifier: type === 'email' ? identifier.toLowerCase() : identifier,
      type: type,
      createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) } // Last 15 minutes
    });

    if (recentOTPs >= 3) {
      return res.status(200).json({
        success: false,
        message: 'Too many OTP requests. Please wait 15 minutes before requesting again.',
        data: null
      });
    }

    // Get OTP settings
    const otpExpiryMinutes = await settingsService.getSetting('auth.otpExpiryMinutes');

    // Generate OTP
    const otpCode = OTP.generateOTP();
    const expiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);

    // Save OTP to database
    const otpRecord = await OTP.create({
      identifier: type === 'email' ? identifier.toLowerCase() : identifier,
      otp: otpCode,
      type: type,
      expiresAt: expiresAt,
      attempts: 0,
      isUsed: false
    });

    // Send OTP based on type
    let sendResult = false;
    
    if (type === 'email') {
      sendResult = await sendEmailOTP(identifier, otpCode);
    } else if (type === 'phone') {
      sendResult = await sendSMSOTP(identifier, otpCode);
    }

    if (!sendResult) {
      // Delete the OTP record if sending failed
      await OTP.findByIdAndDelete(otpRecord._id);
      
      return res.status(200).json({
        success: false,
        message: `Failed to send OTP via ${type}. Please try again.`,
        data: null
      });
    }

    // Prepare response
    const responseData = {
      type: type,
      expiresIn: otpExpiryMinutes * 60, // seconds
      otpLength: 6
    };

    // Add masked identifier
    if (type === 'email') {
      responseData.email = maskEmail(identifier);
    } else {
      responseData.phone = maskPhone(identifier);
    }

    return res.status(200).json({
      success: true,
      message: `OTP sent successfully to your ${type}`,
      data: responseData
    });

  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send OTP. Please try again.',
      data: null
    });
  }
};

/**
 * Verify OTP
 * @route POST /api/auth/otp/verify
 * @desc Verify OTP code
 * @access Public
 */
export const verifyOTP = async (req, res) => {
  try {
    const { 
      identifier, // email or phone
      otp,
      type // 'email' or 'phone'
    } = req.body;

    // Input validation
    if (!identifier || !otp || !type) {
      return res.status(200).json({
        success: false,
        message: 'Identifier, OTP, and type are required',
        data: null
      });
    }

    if (!['email', 'phone'].includes(type)) {
      return res.status(200).json({
        success: false,
        message: 'Type must be either email or phone',
        data: null
      });
    }

    if (otp.length !== 6) {
      return res.status(200).json({
        success: false,
        message: 'OTP must be 6 digits',
        data: null
      });
    }

    // Find valid OTP
    const otpRecord = await OTP.findValidOTP(
      type === 'email' ? identifier.toLowerCase() : identifier,
      type,
      otp
    );

    if (!otpRecord) {
      // Check if there's any OTP record to increment attempts
      const anyOTPRecord = await OTP.findOne({
        identifier: type === 'email' ? identifier.toLowerCase() : identifier,
        type: type,
        otp: otp,
        isUsed: false,
        expiresAt: { $gt: new Date() }
      });

      if (anyOTPRecord && anyOTPRecord.attempts < 3) {
        await anyOTPRecord.incrementAttempts();
      }

      return res.status(200).json({
        success: false,
        message: 'Invalid or expired OTP',
        data: null
      });
    }

    // Mark OTP as used
    await otpRecord.markAsUsed();

    // Find and update user verification status
    const query = type === 'email' 
      ? { email: identifier.toLowerCase() }
      : { phone: identifier };
    
    const user = await User.findOne(query);
    
    if (user) {
      // Update verification status
      if (type === 'email') {
        user.isEmailVerified = true;
      } else {
        user.isPhoneVerified = true;
      }

      // Auto-update isVerified if both email and phone are verified
      if (user.isEmailVerified && user.isPhoneVerified) {
        user.isVerified = true;
      }

      await user.save();

      // Prepare response with user info
      const responseData = {
        userId: user._id,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
        isVerified: user.isVerified,
        type: type
      };

      // Add masked contact info
      if (user.email) {
        responseData.email = maskEmail(user.email);
      }
      
      if (user.phone) {
        responseData.phone = maskPhone(user.phone);
      }

      return res.status(200).json({
        success: true,
        message: `${type.charAt(0).toUpperCase() + type.slice(1)} verified successfully`,
        data: responseData
      });
    } else {
      // OTP verified but no user found (shouldn't happen in normal flow)
      return res.status(200).json({
        success: true,
        message: 'OTP verified successfully',
        data: {
          type: type,
          verified: true
        }
      });
    }

  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'OTP verification failed. Please try again.',
      data: null
    });
  }
};

/**
 * Resend OTP
 * @route POST /api/auth/otp/resend
 * @desc Resend OTP to email or phone
 * @access Public
 */
export const resendOTP = async (req, res) => {
  try {
    const { 
      identifier, // email or phone
      type // 'email' or 'phone'
    } = req.body;

    // Input validation
    if (!identifier || !type) {
      return res.status(200).json({
        success: false,
        message: 'Identifier and type are required',
        data: null
      });
    }

    if (!['email', 'phone'].includes(type)) {
      return res.status(200).json({
        success: false,
        message: 'Type must be either email or phone',
        data: null
      });
    }

    // Check if there's a recent OTP request
    const recentOTP = await OTP.findOne({
      identifier: type === 'email' ? identifier.toLowerCase() : identifier,
      type: type,
      createdAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) } // Last 2 minutes
    }).sort({ createdAt: -1 });

    if (recentOTP) {
      return res.status(200).json({
        success: false,
        message: 'Please wait 2 minutes before requesting a new OTP',
        data: null
      });
    }

    // Check daily limit
    const todayOTPs = await OTP.countDocuments({
      identifier: type === 'email' ? identifier.toLowerCase() : identifier,
      type: type,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    });

    if (todayOTPs >= 10) {
      return res.status(200).json({
        success: false,
        message: 'Daily OTP limit reached. Please try again tomorrow.',
        data: null
      });
    }

    // Delete any existing unused OTPs for this identifier
    await OTP.deleteMany({
      identifier: type === 'email' ? identifier.toLowerCase() : identifier,
      type: type,
      isUsed: false
    });

    // Generate new OTP
    const otpExpiryMinutes = await settingsService.getSetting('auth.otpExpiryMinutes');
    const otpCode = OTP.generateOTP();
    const expiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);

    // Save new OTP to database
    const otpRecord = await OTP.create({
      identifier: type === 'email' ? identifier.toLowerCase() : identifier,
      otp: otpCode,
      type: type,
      expiresAt: expiresAt,
      attempts: 0,
      isUsed: false
    });

    // Send OTP based on type
    let sendResult = false;
    
    if (type === 'email') {
      sendResult = await sendEmailOTP(identifier, otpCode);
    } else if (type === 'phone') {
      sendResult = await sendSMSOTP(identifier, otpCode);
    }

    if (!sendResult) {
      // Delete the OTP record if sending failed
      await OTP.findByIdAndDelete(otpRecord._id);
      
      return res.status(200).json({
        success: false,
        message: `Failed to resend OTP via ${type}. Please try again.`,
        data: null
      });
    }

    // Prepare response
    const responseData = {
      type: type,
      expiresIn: otpExpiryMinutes * 60, // seconds
      otpLength: 6
    };

    // Add masked identifier
    if (type === 'email') {
      responseData.email = maskEmail(identifier);
    } else {
      responseData.phone = maskPhone(identifier);
    }

    return res.status(200).json({
      success: true,
      message: `OTP resent successfully to your ${type}`,
      data: responseData
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to resend OTP. Please try again.',
      data: null
    });
  }
};

/**
 * Send Email OTP
 * @param {string} email - Email address
 * @param {string} otp - OTP code
 * @returns {boolean} - Success status
 */
async function sendEmailOTP(email, otp) {
  try {
    // Create transporter
    const transporter = nodemailer.createTransporter({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // Email content
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: 'Talk Syne - Email Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Talk Syne Verification</h2>
          <p>Your email verification code is:</p>
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #007bff; letter-spacing: 5px; margin: 0;">${otp}</h1>
          </div>
          <p>This code will expire in 5 minutes.</p>
          <p>If you didn't request this code, please ignore this email.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">Talk Syne - Connect instantly with caring consultants</p>
        </div>
      `
    };

    // Send email
    await transporter.sendMail(mailOptions);
    return true;

  } catch (error) {
    console.error('Email OTP send error:', error);
    return false;
  }
}

/**
 * Send SMS OTP via MSG91
 * @param {string} phone - Phone number
 * @param {string} otp - OTP code
 * @returns {boolean} - Success status
 */
async function sendSMSOTP(phone, otp) {
  try {
    const msg91ApiKey = process.env.MSG91_API_KEY;
    const msg91SenderId = process.env.MSG91_SENDER_ID || 'TALKSN';
    
    if (!msg91ApiKey) {
      console.error('MSG91 API key not configured');
      return false;
    }

    // MSG91 API call
    const response = await fetch('https://api.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authkey': msg91ApiKey
      },
      body: JSON.stringify({
        sender: msg91SenderId,
        mobile: phone.replace(/[^0-9]/g, ''), // Remove non-digits
        message: `Your Talk Syne verification code is ${otp}. Valid for 5 minutes. Don't share with anyone.`,
        otp: otp
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('SMS sent successfully:', result);
      return true;
    } else {
      console.error('MSG91 API error:', response.status, await response.text());
      return false;
    }

  } catch (error) {
    console.error('SMS OTP send error:', error);
    return false;
  }
}