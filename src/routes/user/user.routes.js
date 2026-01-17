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
  getTransactionHistory, 
  rechargeWallet,
  getRechargeHistory
} from '../../controllers/user/wallet.controller.js';
import { getUserCommunicationSessions } from '../../controllers/session/session.controller.js';
import { updatePushToken } from '../../controllers/user/notification.controller.js';
import { blockUser, getMyBlockedUsers, unblockUser } from '../../controllers/user/block.controller.js';

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
router.get('/getrechargehistory', getRechargeHistory);

// Session Management (Shared between customer & consultant)
router.get('/sessions', getUserCommunicationSessions);


router.post('/push-token', updatePushToken);rechargeWallet
router.post('/rechargewallet', rechargeWallet);


//Block Matters
router.post('/block', blockUser);
router.post('/unblock', unblockUser);
router.get('/blocked-users', getMyBlockedUsers);

export default router;