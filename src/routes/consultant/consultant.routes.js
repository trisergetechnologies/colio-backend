import express from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { roleMiddleware } from '../../middlewares/role.middleware.js';
// import { validateRequest, validationSchemas } from '../../middlewares/validation.middleware.js';
import { apiRateLimit } from '../../middlewares/rateLimit.middleware.js';

// Consultant controllers
import {
  getAvailabilityStatus,
  updateAvailability
} from '../../controllers/consultant/availability.controller.js';
import { getConsultantPerformance } from '../../controllers/consultant/performance.controller.js';
import { getSettlements } from '../../controllers/consultant/settlement.controller.js';
import {
  getOnboardingStatus,
  postOnboardingAgreement,
  postOnboardingDocuments,
  putOnboardingProfile,
} from '../../controllers/consultant/onboarding.controller.js';
import { uploadConsultantDocuments } from '../../middlewares/upload.middleware.js';
// import { acceptSession, declineSession } from '../../controllers/session/session.controller.js';

const router = express.Router();

// Apply auth middleware and consultant role check
router.use(authMiddleware);
router.use(roleMiddleware(['consultant']));
router.use(apiRateLimit);

// Self-onboarding (pending consultants)
router.get('/onboarding/status', getOnboardingStatus);
router.put('/onboarding/profile', putOnboardingProfile);
router.post(
  '/onboarding/documents',
  uploadConsultantDocuments.fields([
    { name: 'aadhaarFront', maxCount: 1 },
    { name: 'aadhaarBack', maxCount: 1 },
    { name: 'panCard', maxCount: 1 },
    { name: 'profilePhoto', maxCount: 1 },
  ]),
  postOnboardingDocuments
);
router.post('/onboarding/agreement', postOnboardingAgreement);

// Availability Management
router.put('/availability', 
  // validateRequest(validationSchemas.updateAvailability),
  updateAvailability
);

router.get('/status', getAvailabilityStatus);
router.get('/performance', getConsultantPerformance);
router.get('/getsettlements', getSettlements);

// Session Management
// router.post('/session/:id/accept', acceptSession);

// router.post('/session/:id/decline', declineSession);

export default router;