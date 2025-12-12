import express from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { roleMiddleware } from '../../middlewares/role.middleware.js';
// import { validateRequest, validationSchemas } from '../../middlewares/validation.middleware.js';
import { apiRateLimit, sessionStartRateLimit } from '../../middlewares/rateLimit.middleware.js';

// Customer controllers
import { 
  getAvailableConsultants, 
  getConsultantDetails, 
  searchConsultants, 
  addToFavorites, 
  removeFromFavorites, 
  getFavoriteConsultants, 
  quickConnect
} from '../../controllers/consultant/discovery.controller.js';
import { startSession } from '../../controllers/session/session.controller.js';

const router = express.Router();

// Apply auth middleware and customer role check
router.use(authMiddleware);
router.use(roleMiddleware(['customer']));
router.use(apiRateLimit);

// Consultant Discovery
router.get('/consultants', getAvailableConsultants);
router.get('/quickconnect', quickConnect);

router.get('/consultant/:id', getConsultantDetails);

router.get('/consultants/search', 
  // validateRequest(validationSchemas.searchConsultants, 'query'),
  searchConsultants
);

// Favorites Management
router.post('/favorites', 
  // validateRequest(validationSchemas.addToFavorites),
  addToFavorites
);

router.delete('/favorites/:id', removeFromFavorites);

router.get('/favorites', getFavoriteConsultants);

// Session Initiation
router.post('/session/start', 
  sessionStartRateLimit,
  // validateRequest(validationSchemas.startSession),
  startSession
);

export default router;