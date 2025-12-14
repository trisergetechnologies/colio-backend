import Session from '../models/Session.js';
import User from '../models/User.js';
import settingsService from './settingsService.js';
import socketHandler from '../sockets/socket.handler.js';

class BillingService {
  constructor() {
    this.activeBillingSessions = new Map(); // sessionId -> billing data
    this.billingIntervals = new Map(); // sessionId -> intervalId
  }

  /**
   * Start billing for a session
   */
  async startBilling(sessionId) {
    try {
      console.log(`Starting billing for session: ${sessionId}`);

      // Get session details
      const session = await Session.findById(sessionId)
        .populate('customer', 'wallet')
        .populate('consultant', 'name');

      if (!session || session.status !== 'ongoing') {
        throw new Error('Invalid session for billing');
      }

      // Check if billing already active
      if (this.activeBillingSessions.has(sessionId)) {
        console.log(`Billing already active for session: ${sessionId}`);
        return;
      }

      // Get billing settings
      const billingInterval = await settingsService.getSetting('billingIntervalSeconds');
      const lowBalanceWarning = await settingsService.getSetting('lowBalanceWarningMinutes');
      const notificationIntervals = await settingsService.getSetting('billingNotificationIntervals');

      // Initialize billing data
      const billingData = {
        sessionId,
        customerId: session.customer._id,
        consultantId: session.consultant._id,
        ratePerMinute: session.ratePerMinute,
        startTime: new Date(),
        totalMinutesBilled: 0,
        totalCostAccumulated: 0,
        lastBillingTime: new Date(),
        connectionStatus: 'connected',
        warningsSent: new Set()
      };

      this.activeBillingSessions.set(sessionId, billingData);

      // Start billing interval
      const intervalId = setInterval(async () => {
        await this.processBillingCycle(sessionId);
      }, billingInterval * 1000);

      this.billingIntervals.set(sessionId, intervalId);

      // Send billing started notification
      // this.sendBillingNotification(session.customer._id, {
      //   type: 'billing:started',
      //   sessionId,
      //   ratePerMinute: session.ratePerMinute,
      //   message: `Billing started at $${session.ratePerMinute}/minute`
      // });

      return billingData;

    } catch (error) {
      console.error('Start billing error:', error);
      throw error;
    }
  }

  /**
   * Process billing cycle (runs every minute)
   */
  async processBillingCycle(sessionId) {
    try {
      const billingData = this.activeBillingSessions.get(sessionId);
      if (!billingData) return;

      // Skip billing if user is disconnected and within grace period
      const graceSeconds = await settingsService.getSetting('connectionGraceSeconds');
      if (billingData.connectionStatus === 'disconnected') {
        const disconnectedTime = (new Date() - billingData.disconnectedAt) / 1000;
        if (disconnectedTime < graceSeconds) {
          console.log(`Skipping billing - user disconnected within grace period: ${sessionId}`);
          return;
        }
      }

      // Calculate time elapsed since last billing
      const now = new Date();
      const timeElapsed = (now - billingData.lastBillingTime) / (1000 * 60); // in minutes

      // Only bill if at least 1 minute has passed
      if (timeElapsed < 1) return;

      // Get customer's current balance
      const customer = await User.findById(billingData.customerId);
      const totalBalance = customer.wallet.main + customer.wallet.bonus;

      // Calculate cost for this billing cycle
      const minutesToBill = Math.ceil(timeElapsed); // Ceiling billing
      const costThisCycle = minutesToBill * billingData.ratePerMinute;

      // Check if customer has sufficient balance
      if (totalBalance < costThisCycle) {
        await this.handleInsufficientFunds(sessionId);
        return;
      }

      // Deduct money from customer wallet
      await this.deductFromWallet(billingData.customerId, costThisCycle);

      // Update billing data
      billingData.totalMinutesBilled += minutesToBill;
      billingData.totalCostAccumulated += costThisCycle;
      billingData.lastBillingTime = now;

      // Update session in database
      await Session.findByIdAndUpdate(sessionId, {
        durationMinutes: billingData.totalMinutesBilled,
        totalCost: billingData.totalCostAccumulated,
        lastActivity: now
      });

      // Check for low balance warnings
      await this.checkLowBalanceWarnings(sessionId);

      // Send billing update to customer
      // this.sendBillingNotification(billingData.customerId, {
      //   type: 'billing:deducted',
      //   sessionId,
      //   minutesBilled: minutesToBill,
      //   costDeducted: costThisCycle,
      //   totalCost: billingData.totalCostAccumulated,
      //   remainingBalance: totalBalance - costThisCycle
      // });

      console.log(`Billed ${minutesToBill} minutes ($${costThisCycle}) for session: ${sessionId}`);

    } catch (error) {
      console.error(`Billing cycle error for session ${sessionId}:`, error);
      await this.handleBillingError(sessionId, error);
    }
  }

  /**
   * Pause billing (when user disconnects)
   */
  pauseBilling(sessionId) {
    const billingData = this.activeBillingSessions.get(sessionId);
    if (billingData) {
      billingData.connectionStatus = 'disconnected';
      billingData.disconnectedAt = new Date();
      console.log(`Billing paused for session: ${sessionId}`);
    }
  }

  /**
   * Resume billing (when user reconnects)
   */
  resumeBilling(sessionId) {
    const billingData = this.activeBillingSessions.get(sessionId);
    if (billingData) {
      billingData.connectionStatus = 'connected';
      billingData.disconnectedAt = null;
      console.log(`Billing resumed for session: ${sessionId}`);
    }
  }

  /**
   * Stop billing for a session
   */
  async stopBilling(sessionId) {
  try {
    // Prevent multiple calls for same session
    if (!this.activeBillingSessions.has(sessionId)) {
      console.log(`Billing already stopped for session: ${sessionId}`);
      return { durationMinutes: 0, totalCost: 0 };
    }

    console.log(`Stopping billing for session: ${sessionId}`);

    // Clear billing interval FIRST
    const intervalId = this.billingIntervals.get(sessionId);
    if (intervalId) {
      clearInterval(intervalId);
      this.billingIntervals.delete(sessionId);
    }

    // Get billing data and REMOVE from active sessions immediately
    const billingData = this.activeBillingSessions.get(sessionId);
    this.activeBillingSessions.delete(sessionId); // Remove immediately to prevent loops

    if (billingData) {
      // Calculate final billing without recursive call
      const finalDuration = new Date() - billingData.startTime;
      const finalMinutes = Math.ceil(finalDuration / (1000 * 60));
      const finalCost = finalMinutes * billingData.ratePerMinute;

      // Update session
      await Session.findByIdAndUpdate(sessionId, {
        durationMinutes: finalMinutes,
        totalCost: finalCost,
        endedAt: new Date(),
        status: 'completed'
      });

      return { durationMinutes: finalMinutes, totalCost: finalCost };
    }

    return { durationMinutes: 0, totalCost: 0 };

  } catch (error) {
    console.error('Stop billing error:', error);
    // Clean up even on error
    this.activeBillingSessions.delete(sessionId);
    this.billingIntervals.delete(sessionId);
    throw error;
  }
}

  /**
   * Check if session can be resumed
   */
  async canResumeSession(customerId, consultantId) {
    const resumeWindow = await settingsService.getSetting('sessionResumeWindowMinutes');

      // Validate resumeWindow
      if (isNaN(resumeWindow) || resumeWindow <= 0) {
          console.warn('Invalid sessionResumeWindowMinutes:', resumeWindow);
          return null;
      }

    const cutoffTime = new Date(Date.now() - resumeWindow * 60 * 1000);

    const resumableSession = await Session.findOne({
      customer: customerId,
      consultant: consultantId,
      status: 'ongoing',
      lastActivity: { $gte: cutoffTime }
    });

    return resumableSession;
  }

  /**
   * Handle insufficient funds
   */
  async handleInsufficientFunds(sessionId) {
    const billingData = this.activeBillingSessions.get(sessionId);
    const autoEnd = await settingsService.getSetting('autoEndOnInsufficientFunds');

    if (autoEnd) {
      // End session due to insufficient funds
      await this.stopBilling(sessionId);
      
      await Session.findByIdAndUpdate(sessionId, {
        status: 'completed',
        endReason: 'insufficient_funds',
        endedAt: new Date()
      });

    } else {
      // Just send warning
      console.log("abc");
    }
  }

  /**
   * Check and send low balance warnings
   */
  async checkLowBalanceWarnings(sessionId) {
    const billingData = this.activeBillingSessions.get(sessionId);
    const customer = await User.findById(billingData.customerId);
    const totalBalance = customer.wallet.main + customer.wallet.bonus;
    
    const warningMinutes = await settingsService.getSetting('lowBalanceWarningMinutes');
    const remainingMinutes = Math.floor(totalBalance / billingData.ratePerMinute);

    if (remainingMinutes <= warningMinutes && !billingData.warningsSent.has(remainingMinutes)) {
      // this.sendBillingNotification(billingData.customerId, {
      //   type: 'billing:low_balance',
      //   remainingMinutes,
      //   message: `Low balance warning: ${remainingMinutes} minutes remaining`
      // });
      
      billingData.warningsSent.add(remainingMinutes);
    }
  }

  /**
   * Deduct money from customer wallet (prioritize bonus)
   */
  async deductFromWallet(customerId, amount) {
    const customer = await User.findById(customerId);
    let remainingAmount = amount;

    // Use bonus wallet first
    if (customer.wallet.bonus >= remainingAmount) {
      customer.wallet.bonus -= remainingAmount;
      remainingAmount = 0;
    } else if (customer.wallet.bonus > 0) {
      remainingAmount -= customer.wallet.bonus;
      customer.wallet.bonus = 0;
    }

    // Use main wallet for remaining amount
    if (remainingAmount > 0) {
      customer.wallet.main -= remainingAmount;
    }

    await customer.save();
  }

  /**
   * Send billing notification via socket
   */
  // sendBillingNotification(userId, notification) {
  //   if (socketHandler.io) {
  //     socketHandler.io.to(`user_${userId}`).emit('billing:notification', {
  //       ...notification,
  //       timestamp: new Date()
  //     });
  //   }
  // }

  /**
   * Handle billing errors
   */
  async handleBillingError(sessionId, error) {
    console.error(`Billing error for session ${sessionId}:`, error.message);
    
    const billingData = this.activeBillingSessions.get(sessionId);
    // if (billingData) {
    //   this.sendBillingNotification(billingData.customerId, {
    //     type: 'billing:error',
    //     message: 'Billing system error. Please contact support.'
    //   });
    // }
  }

  /**
   * Get billing status for a session
   */
  getBillingStatus(sessionId) {
    return this.activeBillingSessions.get(sessionId) || null;
  }

  /**
   * Get all active billing sessions
   */
  getActiveBillingSessions() {
    return Array.from(this.activeBillingSessions.keys());
  }
}

// Export singleton instance
const billingService = new BillingService();
export default billingService;