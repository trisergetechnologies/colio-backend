import express from 'express';
import { authRateLimit, otpRateLimit } from '../../middlewares/rateLimit.middleware.js';
// import { validateRequest, validationSchemas } from '../../middlewares/validation.middleware.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

// Auth controllers
import { registerUser } from '../../controllers/auth/register.controller.js';
import {
    loginUser,
    logoutUser,
    refreshToken,
    forgotPassword,
    resetPassword,
    changePassword
} from '../../controllers/auth/login.controller.js';
import {
    sendOTP,
    verifyOTP,
    resendOTP
} from '../../controllers/auth/otp.controller.js';
import { googleRegister } from '../../controllers/auth/googleRegisterController.js';
import { googleLogin } from '../../controllers/auth/googleLoginController.js';
import { googleOAuth } from '../../controllers/auth/googleOAuthController.js';

const router = express.Router();

// Registration
router.post('/register',
    authRateLimit,
    // validateRequest(validationSchemas.register),
    registerUser
);

// Login & Authentication
router.post('/login',
    authRateLimit,
    // validateRequest(validationSchemas.login),
    loginUser
);

router.post("/google-register", authRateLimit, googleRegister);
router.post("/google-login", authRateLimit, googleLogin);
router.get("/google/oauth", googleOAuth);

router.post('/logout',
    authMiddleware,
    logoutUser
);

router.post('/refresh-token',
    authRateLimit,
    refreshToken
);

// OTP Management
router.post('/otp/send',
    otpRateLimit,
    // validateRequest(validationSchemas.sendOTP),
    sendOTP
);

router.post('/otp/verify',
    otpRateLimit,
    // validateRequest(validationSchemas.verifyOTP),
    verifyOTP
);

router.post('/otp/resend',
    otpRateLimit,
    // validateRequest(validationSchemas.sendOTP),
    resendOTP
);

// Password Management
router.post('/forgot-password',
    authRateLimit,
    forgotPassword
);

router.post('/reset-password',
    authRateLimit,
    resetPassword
);

router.post('/change-password',
    authMiddleware,
    // validateRequest(validationSchemas.changePassword),
    changePassword
);

export default router;