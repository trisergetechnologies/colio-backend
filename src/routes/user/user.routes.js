import express from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
// import { validateRequest, validationSchemas } from '../../middlewares/validation.middleware.js';
import { apiRateLimit } from '../../middlewares/rateLimit.middleware.js';

// User controllers
import { 
  getProfile, 
  updateProfile, 
  uploadAvatar, 
  deleteAvatar, 
  updatePassword 
} from '../../controllers/user/profile.controller.js';
import { 
  getWalletBalance, 
  getTransactionHistory 
} from '../../controllers/user/wallet.controller.js';
import { 
  getUserSessions, 
  getSessionDetails, 
  endSession 
} from '../../controllers/session/session.controller.js';
import { updatePushToken } from '../../controllers/user/notification.controller.js';

const router = express.Router();

// Apply auth middleware to all user routes
router.use(authMiddleware);
router.use(apiRateLimit);

// Profile Management
router.get('/profile', getProfile);

router.put('/profile', 
  // validateRequest(validationSchemas.updateProfile),
  updateProfile
);

router.post('/avatar', uploadAvatar);

router.delete('/avatar', deleteAvatar);

router.put('/password', 
  // validateRequest(validationSchemas.changePassword),
  updatePassword
);

// Wallet Information
router.get('/wallet', getWalletBalance);

router.get('/transactions', getTransactionHistory);

// Session Management (Shared between customer & consultant)
router.get('/sessions', getUserSessions);

router.get('/session/:id', getSessionDetails);

router.post('/session/:id/end', endSession);

router.post('/push-token', updatePushToken);

export default router;