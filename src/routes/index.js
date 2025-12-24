import express from 'express';


// Import route modules
import authRoutes from './auth/auth.routes.js';
import userRoutes from './user/user.routes.js';
import customerRoutes from './customer/customer.routes.js';
import consultantRoutes from './consultant/consultant.routes.js';
import sessionRoutes from './session/session.routes.js';
import agoraRoutes from './agora/agoraRoutes.js'
import communicationRoutes from './agora/communicationRoutes.js'
import chatRoutes from './chat/chatRoutes.js';
import adminRoutes from './admin/adminRoutes.js';
import notificationRoutes from './user/notificationRoutes.js';

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Talk Syne API is healthy',
    data: {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0'
    }
  });
});

// API information endpoint
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to Talk Syne API',
    data: {
      version: '1.0.0',
      description: 'Connect instantly with caring consultants',
      endpoints: {
        auth: '/api/auth',
        user: '/api/user', 
        customer: '/api/customer',
        consultant: '/api/consultant',
        session: '/api/session'
      },
      documentation: '/api/health'
    }
  });
});

// Mount route modules
router.use('/auth', authRoutes);           // /api/auth/*
router.use('/admin', adminRoutes);         // /api/admin/*
router.use('/user', userRoutes);           // /api/user/*
router.use('/customer', customerRoutes);   // /api/customer/*
router.use('/consultant', consultantRoutes); // /api/consultant/*
router.use('/session', sessionRoutes);     // /api/session/*
router.use('/agora', agoraRoutes);        // /api/agora/*
router.use('/communication', communicationRoutes); // /api/communication/*
router.use('/chat', chatRoutes); // /api/chat/*
router.use('/notifications', notificationRoutes);


export default router;