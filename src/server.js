import express from 'express';
import { createServer } from 'http';
import dotenv from 'dotenv';
import chalk from 'chalk';
import cors from 'cors';
import helmet from 'helmet';
import connectDB from './config/db.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import { apiRateLimit } from './middlewares/rateLimit.middleware.js';
import apiRoutes from './routes/index.js';
// import socketHandler from './sockets/socket.handler.js';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Connect to MongoDB
connectDB();

// Initialize Socket.io
// const io = socketHandler.initialize(httpServer);

// Security middleware
app.use(helmet());

app.use(cors());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files middleware for uploaded files
app.use('/uploads', express.static('uploads'));

// Global rate limiting
app.use(apiRateLimit);

// API routes
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: `Talk Syne API is running in ${process.env.NODE_ENV} mode`,
    data: {
      version: '1.0.0',
      environment: process.env.NODE_ENV,
      features: {
        realTimeChat: true,
        realTimeBilling: true,
        socketConnections: socketHandler.getConnectedUsersCount()
      },
      endpoints: {
        api: '/api',
        health: '/api/health',
        auth: '/api/auth',
        websocket: '/socket.io',
        docs: '/api'
      }
    }
  });
});

// Global error handling (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 8000;

// Use httpServer instead of app for listening (to support Socket.io)
httpServer.listen(PORT, () => {
  const envColor = process.env.NODE_ENV === 'production' ? chalk.redBright : chalk.cyanBright;
  
  console.log(
    chalk.yellowBright('⚡ Talk Syne Server with Socket.io running at:') +
    ' ' +
    envColor(`http://localhost:${PORT}`) +
    ' ' +
    chalk.gray(`(${process.env.NODE_ENV} mode)`)
  );
  
  console.log(
    chalk.greenBright('📱 API Endpoints:') +
    '\n' +
    chalk.gray(`   Health: http://localhost:${PORT}/api/health`) +
    '\n' +
    chalk.gray(`   Auth: http://localhost:${PORT}/api/auth`) +
    '\n' +
    chalk.gray(`   Chat: http://localhost:${PORT}/api/session`) +
    '\n' +
    chalk.gray(`   WebSocket: ws://localhost:${PORT}/socket.io`)
  );
  
  console.log(
    chalk.cyanBright('🔌 Real-time Features:') +
    '\n' +
    chalk.gray(`   Live Chat: Enabled`) +
    '\n' +
    chalk.gray(`   Real-time Billing: Enabled`) +
    '\n' +
    chalk.gray(`   Typing Indicators: Enabled`) +
    '\n' +
    chalk.gray(`   Read Receipts: Enabled`)
  );
});

// Enhanced graceful shutdown with Socket.io cleanup
process.on('SIGTERM', async () => {
  console.log(chalk.yellow('SIGTERM received. Shutting down gracefully...'));
  
  // Close Socket.io connections
  // if (socketHandler.io) {
  //   console.log(chalk.gray('Closing Socket.io connections...'));
  //   socketHandler.io.close();
  // }
  
  // Close HTTP server
  httpServer.close(() => {
    console.log(chalk.green('Server shut down successfully'));
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log(chalk.yellow('\nSIGINT received. Shutting down gracefully...'));
  
  // Close Socket.io connections
  // if (socketHandler.io) {
  //   console.log(chalk.gray('Closing Socket.io connections...'));
  //   socketHandler.io.close();
  // }
  
  // Close HTTP server
  httpServer.close(() => {
    console.log(chalk.green('Server shut down successfully'));
    process.exit(0);
  });
});