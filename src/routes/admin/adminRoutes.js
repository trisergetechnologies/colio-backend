import express from 'express';
import { onboardConsultantByAdmin, updateConsultantByAdmin } from '../../controllers/admin/adminConsultantController.js';
import { getSystemWalletWithLogs } from '../../controllers/admin/adminSystemWalletController.js';
import { getUsersForAdmin } from '../../controllers/admin/adminUsersController.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { adminOnlyMiddleware } from '../../middlewares/role.middleware.js';
import { approveSettlement, createPendingSettlements, getSettlementsForAdmin, rejectSettlement } from '../../controllers/admin/adminSettlementsController.js';

const router = express.Router();

// Apply auth middleware to all user routes
router.use(authMiddleware);
router.use(adminOnlyMiddleware);

// Profile Management
router.post('/onboard-consultant', onboardConsultantByAdmin);
router.get('/system-wallet', getSystemWalletWithLogs);
router.put('/updateconsultant/:consultantId', updateConsultantByAdmin);

router.get('/getusersforadmin', getUsersForAdmin);


//Settlement Routes
router.post('/create-pending', createPendingSettlements);
router.post('/:settlementId/approve', approveSettlement);
router.post('/:settlementId/reject', rejectSettlement);
router.get('/getsettlements', getSettlementsForAdmin);


export default router;