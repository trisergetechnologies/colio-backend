import express from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { roleMiddleware } from '../../middlewares/role.middleware.js';
// import { validateRequest, validationSchemas } from '../../middlewares/validation.middleware.js';
import { apiRateLimit } from '../../middlewares/rateLimit.middleware.js';

// Consultant controllers
import { 
  updateAvailability, 
  getAvailabilityStatus 
} from '../../controllers/consultant/availability.controller.js';
import { getConsultantPerformance } from '../../controllers/consultant/performance.controller.js';
// import { acceptSession, declineSession } from '../../controllers/session/session.controller.js';

const router = express.Router();

// Apply auth middleware and consultant role check
router.use(authMiddleware);
router.use(roleMiddleware(['consultant']));
router.use(apiRateLimit);

// Availability Management
router.put('/availability', 
  // validateRequest(validationSchemas.updateAvailability),
  updateAvailability
);

router.get('/status', getAvailabilityStatus);
router.get('/performance', getConsultantPerformance);

// Session Management
// router.post('/session/:id/accept', acceptSession);

// router.post('/session/:id/decline', declineSession);

export default router;