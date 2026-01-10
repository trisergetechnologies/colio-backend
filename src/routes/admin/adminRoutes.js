import express from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { adminOnlyMiddleware } from '../../middlewares/role.middleware.js';
import { onboardConsultantByAdmin, updateConsultantByAdmin } from '../../controllers/admin/adminConsultantController.js';
import { getSystemWalletWithLogs } from '../../controllers/admin/adminSystemWalletController.js';

const router = express.Router();

// Apply auth middleware to all user routes
router.use(authMiddleware);
router.use(adminOnlyMiddleware);

// Profile Management
router.post('/onboard-consultant', onboardConsultantByAdmin);
router.get('/system-wallet', getSystemWalletWithLogs);
router.put('/updateconsultant', updateConsultantByAdmin);

export default router;