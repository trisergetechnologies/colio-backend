import Joi from 'joi';

const consultantCategories = ['Loneliness', 'Breakup', 'Feeling Low', 'Stress', 'Overthinking'];

/**
 * Generic validation middleware
 * Validates request body, query, or params against Joi schema
 */
export const validateRequest = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      const dataToValidate = req[source];
      const { error, value } = schema.validate(dataToValidate, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        const errorMessages = error.details.map(detail => detail.message);
        return res.status(200).json({
          success: false,
          message: 'Validation failed',
          data: {
            errors: errorMessages
          }
        });
      }

      // Replace request data with validated and sanitized data
      req[source] = value;
      next();

    } catch (error) {
      console.error('Validation middleware error:', error);
      return res.status(500).json({
        success: false,
        message: 'Validation error',
        data: null
      });
    }
  };
};

/**
 * Common validation schemas for Talk Syne
 */
export const validationSchemas = {
  // Registration validation
  register: Joi.object({
    name: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().pattern(/^[+]?[1-9]\d{1,14}$/).required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid('customer', 'consultant').required(),
    registrationType: Joi.string().valid('email', 'phone', 'google').required(),
    googleId: Joi.string().when('registrationType', {
      is: 'google',
      then: Joi.required(),
      otherwise: Joi.forbidden()
    })
  }),

  // Login validation
  login: Joi.object({
    identifier: Joi.string().required(),
    password: Joi.string().when('loginType', {
      is: 'google',
      then: Joi.optional(),
      otherwise: Joi.required()
    }),
    loginType: Joi.string().valid('email', 'phone', 'google').default('email'),
    googleId: Joi.string().when('loginType', {
      is: 'google',
      then: Joi.required(),
      otherwise: Joi.forbidden()
    })
  }),

  // OTP validation
  sendOTP: Joi.object({
    identifier: Joi.string().required(),
    type: Joi.string().valid('email', 'phone').required(),
    userId: Joi.string().optional()
  }),

  verifyOTP: Joi.object({
    identifier: Joi.string().required(),
    otp: Joi.string().length(6).pattern(/^\d+$/).required(),
    type: Joi.string().valid('email', 'phone').required()
  }),

  // Message validation
  sendMessage: Joi.object({
    content: Joi.string().max(1000).required(),
    messageType: Joi.string().valid('text', 'image', 'file').default('text')
  }),

  // Session validation
  startSession: Joi.object({
    consultantId: Joi.string().required(),
    message: Joi.string().max(500).optional()
  }),

  // Profile update validation
  updateProfile: Joi.object({
    name: Joi.string().min(2).max(50).optional(),
    gender: Joi.string().valid('male', 'female', 'other').optional(),
    dateOfBirth: Joi.date().max('now').optional(),
    languages: Joi.array().items(Joi.string().valid('english', 'hindi','kannada', "marathi", "telugu", "bengali", "malayalam", "punjabi")).optional(),
    bio: Joi.string().max(500).optional(),
    category: Joi.string().valid(...consultantCategories).optional(),
    skills: Joi.array().items(Joi.string().valid(
      'active-listening', 'empathy', 'stress-management',
      'relationship-advice', 'career-guidance', 'general-chat',
      'anxiety-support', 'motivation', 'life-coaching'
    )).optional(),
    ratePerMinute: Joi.number().min(1).max(100).optional()
  }),

  // Consultant availability validation
  updateAvailability: Joi.object({
    availabilityStatus: Joi.string().valid('onWork', 'offWork', 'busy').required()
  }),

  // Favorites validation
  addToFavorites: Joi.object({
    consultantId: Joi.string().required()
  }),

  // Password change validation
  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).required()
  }),

  // Search validation
  searchConsultants: Joi.object({
    q: Joi.string().min(2).required(),
    page: Joi.number().min(1).default(1),
    limit: Joi.number().min(1).max(50).default(20),
    skills: Joi.string().optional(),
    category: Joi.string().valid(...consultantCategories).optional(),
    minRating: Joi.number().min(0).max(5).default(0),
    maxRate: Joi.number().min(1).optional(),
    language: Joi.string().valid('english', 'hindi','kannada', "marathi", "telugu", "bengali", "malayalam", "punjabi").default('english')
  })
};