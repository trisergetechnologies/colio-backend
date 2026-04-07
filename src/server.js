import chalk from 'chalk';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import { createServer } from 'http';
import connectDB from './config/db.js';
import { razorpayWebhook } from './controllers/public/razorpayWebhook.controller.js';
import { startSessionBillingJob } from './jobs/sessionBilling.job.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
// import { apiRateLimit } from './middlewares/rateLimit.middleware.js';
import apiRoutes from './routes/index.js';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

function buildCorsAllowedOrigins() {
  const origins = new Set(['https://colio.in', 'https://www.colio.in']);
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
  }
  if (process.env.CORS_ORIGINS) {
    process.env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean)
      .forEach((o) => origins.add(o));
  }
  return origins;
}

const corsAllowedOrigins = buildCorsAllowedOrigins();

// Connect to MongoDB
connectDB();

// Security middleware
app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (corsAllowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  }),
);

app.post("/razorpay/webhook",express.raw({ type: "application/json" }), razorpayWebhook);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files middleware for uploaded files
app.use('/uploads', express.static('uploads'));
startSessionBillingJob();

app.set('trust proxy', 1);
// Global rate limiting

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

const PORT = Number(process.env.PORT) || 8000;

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      chalk.redBright(`\nPort ${PORT} is already in use — another process is listening on it.`),
    );
    console.error(
      chalk.yellow('Usually this is an old "npm run dev" still running. Stop it, then start again.'),
    );
    console.error(chalk.gray('\nWindows PowerShell — find the PID:'));
    console.error(chalk.cyan(`  netstat -ano | findstr :${PORT}`));
    console.error(chalk.gray('Stop it (replace PID with the last column):'));
    console.error(chalk.cyan('  taskkill /PID <PID> /F'));
    console.error(chalk.gray('\nOr use a different port in .env, e.g. PORT=8001'));
    process.exit(1);
  }
  throw err;
});

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