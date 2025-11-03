import mongoose from 'mongoose';

/**
 * Global error handling middleware for Talk Syne
 * Must be placed after all routes
 */
export const errorHandler = (err, req, res, next) => {
  console.error('Global error handler:', err);

  // Default error response following Talk Syne format
  let error = {
    success: false,
    message: 'Internal server error',
    data: null
  };

  // Mongoose validation error
  if (err instanceof mongoose.Error.ValidationError) {
    const messages = Object.values(err.errors).map(error => error.message);
    error.message = 'Validation failed';
    error.data = { errors: messages };
    return res.status(200).json(error);
  }

  // Mongoose duplicate key error (email/phone already exists)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    if (field === 'email') {
      error.message = 'Email address already registered';
    } else if (field === 'phone') {
      error.message = 'Phone number already registered';
    } else {
      error.message = `${field} already exists`;
    }
    return res.status(200).json(error);
  }

  // Mongoose cast error (invalid ObjectId)
  if (err instanceof mongoose.Error.CastError) {
    if (err.path === '_id') {
      error.message = 'Invalid ID format';
    } else {
      error.message = 'Invalid data format';
    }
    return res.status(200).json(error);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token';
    return res.status(200).json(error);
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expired';
    return res.status(200).json(error);
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    error.message = 'File too large';
    return res.status(200).json(error);
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    error.message = 'Unexpected file field';
    return res.status(200).json(error);
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    error.message = 'Too many files uploaded';
    return res.status(200).json(error);
  }

  // Talk Syne specific errors
  if (err.name === 'InsufficientBalanceError') {
    error.message = 'Insufficient wallet balance';
    return res.status(200).json(error);
  }

  if (err.name === 'SessionNotActiveError') {
    error.message = 'Session is not active';
    return res.status(200).json(error);
  }

  // Custom application errors with status codes
  if (err.statusCode) {
    error.message = err.message;
    return res.status(200).json(error); // Still return 200 for Talk Syne format
  }

  // Default 500 error
  return res.status(500).json(error);
};

/**
 * Handle 404 - Route not found
 */
export const notFoundHandler = (req, res) => {
  return res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    data: null
  });
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Custom error classes for Talk Syne
 */
export class TalkSyneError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'TalkSyneError';
  }
}

export class InsufficientBalanceError extends TalkSyneError {
  constructor(message = 'Insufficient wallet balance') {
    super(message, 400);
    this.name = 'InsufficientBalanceError';
  }
}

export class SessionNotActiveError extends TalkSyneError {
  constructor(message = 'Session is not active') {
    super(message, 400);
    this.name = 'SessionNotActiveError';
  }
}