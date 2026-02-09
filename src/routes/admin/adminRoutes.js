import express from 'express';
import { getSessionDetails, onboardConsultantByAdmin, updateConsultantByAdmin, uploadConsultantAvatarByAdmin } from '../../controllers/admin/adminConsultantController.js';
import { approveSettlement, createPendingSettlements, getSettlementsForAdmin, rejectSettlement } from '../../controllers/admin/adminSettlementsController.js';
import { getSystemWalletWithLogs } from '../../controllers/admin/adminSystemWalletController.js';
import { getUsersForAdmin } from '../../controllers/admin/adminUsersController.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { adminOnlyMiddleware } from '../../middlewares/role.middleware.js';
import { uploadConsultantAvatar } from '../../middlewares/upload.middleware.js';

const router = express.Router();

// Apply auth middleware to all user routes
router.use(authMiddleware);
router.use(adminOnlyMiddleware);

// Profile Management
router.post('/onboard-consultant', onboardConsultantByAdmin);
router.get('/system-wallet', getSystemWalletWithLogs);
router.put('/updateconsultant/:consultantId', updateConsultantByAdmin);
router.post('/consultants/avatar', uploadConsultantAvatar.single('avatar'), uploadConsultantAvatarByAdmin );

router.get('/getusersforadmin', getUsersForAdmin);
router.get('/getsessiondetails', getSessionDetails);


//Settlement Routes
router.post('/create-pending', createPendingSettlements);
router.post('/:settlementId/approve', approveSettlement);
router.post('/:settlementId/reject', rejectSettlement);
router.get('/getsettlements', getSettlementsForAdmin);


export default router;