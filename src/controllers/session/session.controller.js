// 31. POST /api/customer/session/start    # startSession()
// 16. GET  /api/user/sessions             # getUserSessions()
// 17. GET  /api/user/session/:id          # getSessionDetails()
// 18. POST /api/user/session/:id/end      # endSession()


import Session from '../../models/Session.js';
import User from '../../models/User.js';
import ChatMessage from '../../models/ChatMessage.js';
import settingsService from '../../services/settingsService.js';
import billingService from '../../services/billingService.js';
import socketHandler from '../../sockets/socket.handler.js';


/**
 * Start new session
 * @route POST /api/customer/session/start
 * @desc Start a new chat session with a consultant
 * @access Private (Customer only)
 */
// export const startSession = async (req, res) => {
//   try {
//     const { consultantId, message } = req.body;
//     const customerId = req.user.userId;

//     // Input validation
//     if (!consultantId) {
//       return res.status(200).json({
//         success: false,
//         message: 'Consultant ID is required',
//         data: null
//       });
//     }

//     // Find consultant and customer
//     const consultant = await User.findOne({
//       _id: consultantId,
//       role: 'consultant',
//       isActive: true,
//       isVerified: true
//     });

//     const customer = await User.findById(customerId);

//     if (!consultant) {
//       return res.status(200).json({
//         success: false,
//         message: 'Consultant not found or unavailable',
//         data: null
//       });
//     }

//     if (!customer) {
//       return res.status(200).json({
//         success: false,
//         message: 'Customer not found',
//         data: null
//       });
//     }

//     // Check consultant availability
//     if (consultant.consultantProfile.availabilityStatus !== 'onWork') {
//       return res.status(200).json({
//         success: false,
//         message: 'Consultant is currently not available',
//         data: null
//       });
//     }

//     // Check customer wallet balance
//     const minimumBalance = await settingsService.getSetting('financial.minimumWalletBalance');
//     const customerTotalBalance = customer.wallet.main + customer.wallet.bonus;
    
//     if (customerTotalBalance < minimumBalance) {
//       return res.status(200).json({
//         success: false,
//         message: `Insufficient wallet balance. Minimum ${minimumBalance} required.`,
//         data: {
//           currentBalance: customerTotalBalance,
//           minimumRequired: minimumBalance
//         }
//       });
//     }

//     // Check for existing pending/ongoing session between same participants
//     const existingSession = await Session.findOne({
//       customer: customerId,
//       consultant: consultantId,
//       status: { $in: ['pending', 'ongoing'] }
//     });

//     if (existingSession) {
//       return res.status(200).json({
//         success: false,
//         message: `You already have a ${existingSession.status} session with this consultant`,
//         data: {
//           existingSessionId: existingSession._id,
//           status: existingSession.status
//         }
//       });
//     }

//     // Create new session
//     const session = await Session.create({
//       customer: customerId,
//       consultant: consultantId,
//       type: 'chat',
//       status: 'pending',
//       ratePerMinute: consultant.consultantProfile.ratePerMinute,
//       requestedAt: new Date()
//     });

//     // Prepare response data
//     const responseData = {
//       sessionId: session._id,
//       conversationId: session.conversationId,
//       sessionNumber: session.sessionNumber,
//       status: session.status,
//       consultant: {
//         id: consultant._id,
//         name: consultant.name,
//         avatar: consultant.avatar,
//         ratePerMinute: consultant.consultantProfile.ratePerMinute
//       },
//       customer: {
//         id: customer._id,
//         name: customer.name,
//         avatar: customer.avatar
//       },
//       requestedAt: session.requestedAt,
//       estimatedCostPerMinute: session.ratePerMinute
//     };

//     // TODO: Emit Socket.io event to notify consultant
//     // io.to(`user_${consultantId}`).emit('session:request', {
//     //   sessionId: session._id,
//     //   customer: { id: customerId, name: customer.name, avatar: customer.avatar },
//     //   message: message || null
//     // });

//     return res.status(200).json({
//       success: true,
//       message: 'Session request sent successfully. Waiting for consultant to accept.',
//       data: responseData
//     });

//   } catch (error) {
//     console.error('Start session error:', error);
//     return res.status(500).json({
//       success: false,
//       message: 'Failed to start session',
//       data: null
//     });
//   }
// };



export const startSession = async (req, res) => {
  try {
    const { consultantId, type = 'chat' } = req.body;
    const customerId = req.user.userId;

    // Input validation
    if (!consultantId) {
      return res.status(200).json({
        success: false,
        message: 'Consultant ID is required',
        data: null
      });
    }

    if (!['chat', 'voice', 'video'].includes(type)) {
      return res.status(200).json({
        success: false,
        message: 'Invalid session type. Must be chat, voice, or video',
        data: null
      });
    }

    // Find consultant and customer
    const consultant = await User.findOne({
      _id: consultantId,
      role: 'consultant',
      isActive: true,
      isVerified: true
    });

    const customer = await User.findById(customerId);

    if (!consultant) {
      return res.status(200).json({
        success: false,
        message: 'Consultant not found or unavailable',
        data: null
      });
    }

    if (!customer) {
      return res.status(200).json({
        success: false,
        message: 'Customer not found',
        data: null
      });
    }

    // Check consultant availability (must be onWork)
    if (consultant.consultantProfile.availabilityStatus !== 'onWork') {
      return res.status(200).json({
        success: false,
        message: `Consultant is currently ${consultant.consultantProfile.availabilityStatus}. Please try again later.`,
        data: null
      });
    }

    // Check customer wallet balance
    const minimumBalance = await settingsService.getSetting('minimumWalletBalance');
    const customerTotalBalance = customer.wallet.main + customer.wallet.bonus;
    
    if (customerTotalBalance < minimumBalance) {
      return res.status(200).json({
        success: false,
        message: `Insufficient wallet balance. Minimum ${minimumBalance} required.`,
        data: {
          currentBalance: customerTotalBalance,
          minimumRequired: minimumBalance
        }
      });
    }

    // Handle voice/video sessions (TODO for now)
    if (type === 'voice' || type === 'video') {
      return res.status(200).json({
        success: false,
        message: `${type.charAt(0).toUpperCase() + type.slice(1)} sessions are coming soon!`,
        data: { 
          supportedTypes: ['chat'],
          plannedTypes: ['voice', 'video'] 
        }
      });
    }

    // Check for resumable session first
    const resumableSession = await billingService.canResumeSession(customerId, consultantId);
    
    if (resumableSession) {
      // RESUME existing session
      resumableSession.lastActivity = new Date();
      await resumableSession.save();

      // Resume billing if it was paused
      billingService.resumeBilling(resumableSession._id);

      // Update consultant status to busy again
      consultant.consultantProfile.availabilityStatus = 'busy';
      await consultant.save();

      // Prepare response data for resumed session
      const responseData = {
        sessionId: resumableSession._id,
        conversationId: resumableSession.conversationId,
        sessionNumber: resumableSession.sessionNumber,
        type: resumableSession.type,
        status: resumableSession.status,
        consultant: {
          id: consultant._id,
          name: consultant.name,
          avatar: consultant.avatar,
          ratePerMinute: consultant.consultantProfile.ratePerMinute
        },
        customer: {
          id: customer._id,
          name: customer.name,
          avatar: customer.avatar
        },
        timing: {
          requestedAt: resumableSession.requestedAt,
          startedAt: resumableSession.startedAt,
          resumedAt: new Date()
        },
        billing: {
          ratePerMinute: resumableSession.ratePerMinute,
          currentCost: resumableSession.totalCost,
          durationMinutes: resumableSession.durationMinutes
        },
        isResumed: true
      };

      // Notify both participants via socket
      if (socketHandler.io) {
        socketHandler.io.to(`user_${customerId}`).emit('session:resumed', {
          sessionId: resumableSession._id,
          message: 'Your conversation has been resumed. You can continue chatting.',
          billing: responseData.billing
        });

        socketHandler.io.to(`user_${consultantId}`).emit('session:resumed', {
          sessionId: resumableSession._id,
          message: `${customer.name} has resumed the conversation.`,
          billing: responseData.billing
        });
      }

      return res.status(200).json({
        success: true,
        message: `Continuing your conversation with ${consultant.name}...`,
        data: responseData
      });
    }

    // Check for any existing active session with this consultant
    const existingActiveSession = await Session.findOne({
      customer: customerId,
      consultant: consultantId,
      status: { $in: ['pending', 'ongoing'] }
    });

    if (existingActiveSession) {
      return res.status(200).json({
        success: false,
        message: `You already have an ${existingActiveSession.status} session with this consultant`,
        data: {
          existingSessionId: existingActiveSession._id,
          status: existingActiveSession.status,
          conversationId: existingActiveSession.conversationId
        }
      });
    }

    const conversationId = `${customerId}_${consultantId}`;
    const sessionNumber = 1; // For now, we'll fix this properly later

    // Create new session - Auto-start since consultant is onWork
    const session = await Session.create({
      customer: customerId,
      consultant: consultantId,
      conversationId: conversationId,
      sessionNumber: sessionNumber,
      type: type,
      status: 'ongoing', // Auto-start instead of pending
      ratePerMinute: consultant.consultantProfile.ratePerMinute,
      requestedAt: new Date(),
      startedAt: new Date() // Session starts immediately
    });

    // Update consultant status to busy (in session)
    consultant.consultantProfile.availabilityStatus = 'busy';
    await consultant.save();

    // Start billing service for new session
    // await billingService.startBilling(session._id);

    // For chat sessions: Send automatic welcome message
    let welcomeMessage = null;
    if (type === 'chat') {
      welcomeMessage = await ChatMessage.create({
        conversationId: session.conversationId,
        sessionId: session._id,
        sender: consultantId,
        messageNumber: 1,
        receiver: customerId,
        content: `Hi ${customer.name}, my name is ${consultant.name}. How can I help you today?`,
        messageType: 'text',
        status: 'sent'
      });

      // Emit welcome message via socket to customer
      if (socketHandler.io) {
        socketHandler.io.to(`user_${customerId}`).emit('message:received', {
          messageId: welcomeMessage._id,
          conversationId: welcomeMessage.conversationId,
          sessionId: welcomeMessage.sessionId,
          content: welcomeMessage.content,
          messageType: welcomeMessage.messageType,
          sender: {
            id: consultantId,
            name: consultant.name,
            avatar: consultant.avatar,
            role: 'consultant'
          },
          sentAt: welcomeMessage.sentAt,
          status: welcomeMessage.status,
          isWelcomeMessage: true
        });

        // Notify both participants that chat session has started
        const sessionData = {
          sessionId: session._id,
          conversationId: session.conversationId,
          sessionNumber: session.sessionNumber,
          type: session.type,
          status: session.status,
          startedAt: session.startedAt,
          ratePerMinute: session.ratePerMinute
        };

        // Notify customer
        socketHandler.io.to(`user_${customerId}`).emit('session:started', {
          ...sessionData,
          participant: {
            id: consultant._id,
            name: consultant.name,
            avatar: consultant.avatar,
            role: 'consultant'
          },
          message: 'Session started! You can now start chatting.',
          billing: {
            started: true,
            ratePerMinute: session.ratePerMinute,
            billingInterval: await settingsService.getSetting('billingIntervalSeconds')
          }
        });

        // Notify consultant
        socketHandler.io.to(`user_${consultantId}`).emit('session:started', {
          ...sessionData,
          participant: {
            id: customer._id,
            name: customer.name,
            avatar: customer.avatar,
            role: 'customer'
          },
          message: `Session started with ${customer.name}. Welcome message sent.`,
          billing: {
            started: true,
            ratePerMinute: session.ratePerMinute
          }
        });
      }

      // Update session message count and last message time
      session.messageCount = 1;
      session.lastMessageAt = welcomeMessage.sentAt;
      await session.save();
    }

    // Prepare response data
    const responseData = {
      sessionId: session._id,
      conversationId: session.conversationId,
      sessionNumber: session.sessionNumber,
      type: session.type,
      status: session.status,
      consultant: {
        id: consultant._id,
        name: consultant.name,
        avatar: consultant.avatar,
        ratePerMinute: consultant.consultantProfile.ratePerMinute
      },
      customer: {
        id: customer._id,
        name: customer.name,
        avatar: customer.avatar
      },
      timing: {
        requestedAt: session.requestedAt,
        startedAt: session.startedAt
      },
      billing: {
        ratePerMinute: session.ratePerMinute,
        billingStarted: true,
        billingInterval: await settingsService.getSetting('billingIntervalSeconds'),
        estimatedCostPerMinute: session.ratePerMinute
      },
      chat: type === 'chat' ? {
        welcomeMessageSent: true,
        welcomeMessageId: welcomeMessage?._id,
        messageCount: session.messageCount
      } : null,
      isResumed: false
    };

    return res.status(200).json({
      success: true,
      message: type === 'chat' 
        ? `Chat session started successfully! ${consultant.name} has sent you a welcome message. Billing has begun at $${session.ratePerMinute}/minute.`
        : `${type.charAt(0).toUpperCase() + type.slice(1)} session started successfully! Billing has begun at $${session.ratePerMinute}/minute.`,
      data: responseData
    });

  } catch (error) {
    console.error('Start session error:', error);
    
    // If session was created but billing failed, clean up
    if (error.sessionId) {
      try {
        await Session.findByIdAndUpdate(error.sessionId, { 
          status: 'cancelled', 
          endReason: 'billing_error' 
        });
      } catch (cleanupError) {
        console.error('Session cleanup error:', cleanupError);
      }
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to start session',
      data: null
    });
  }
};


/**
 * Get user sessions
 * @route GET /api/user/sessions
 * @desc Get user's session history with pagination
 * @access Private (Both customer & consultant)
 */
export const getUserSessions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 20, status, type } = req.query;

    // Build query
    const query = {
      $or: [
        { customer: userId },
        { consultant: userId }
      ]
    };

    if (status) {
      query.status = status;
    }

    if (type) {
      query.type = type;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get sessions with populated user data
    const sessions = await Session.find(query)
      .populate('customer', 'name avatar')
      .populate('consultant', 'name avatar consultantProfile.ratePerMinute')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalSessions = await Session.countDocuments(query);

    // Format response data
    const responseData = {
      sessions: sessions.map(session => ({
        sessionId: session._id,
        conversationId: session.conversationId,
        sessionNumber: session.sessionNumber,
        type: session.type,
        status: session.status,
        customer: session.customer,
        consultant: session.consultant,
        ratePerMinute: session.ratePerMinute,
        durationMinutes: session.durationMinutes,
        totalCost: session.totalCost,
        requestedAt: session.requestedAt,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        lastMessageAt: session.lastMessageAt,
        messageCount: session.messageCount,
        customerRating: session.customerRating,
        consultantRating: session.consultantRating
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalSessions / limit),
        totalSessions,
        hasNextPage: page < Math.ceil(totalSessions / limit),
        hasPrevPage: page > 1
      }
    };

    return res.status(200).json({
      success: true,
      message: 'Sessions retrieved successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Get user sessions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve sessions',
      data: null
    });
  }
};

/**
 * Get session details
 * @route GET /api/user/session/:id
 * @desc Get detailed information about a specific session
 * @access Private (Session participants only)
 */
export const getSessionDetails = async (req, res) => {
  try {
    const { id: sessionId } = req.params;
    const userId = req.user.userId;

    // Find session with populated data
    const session = await Session.findById(sessionId)
      .populate('customer', 'name email avatar wallet')
      .populate('consultant', 'name email avatar consultantProfile');

    if (!session) {
      return res.status(200).json({
        success: false,
        message: 'Session not found',
        data: null
      });
    }

    // Check if user is participant
    if (session.customer._id.toString() !== userId && session.consultant._id.toString() !== userId) {
      return res.status(200).json({
        success: false,
        message: 'Unauthorized to view this session',
        data: null
      });
    }

    // Prepare detailed response
    const responseData = {
      sessionId: session._id,
      conversationId: session.conversationId,
      sessionNumber: session.sessionNumber,
      type: session.type,
      status: session.status,
      customer: {
        id: session.customer._id,
        name: session.customer.name,
        avatar: session.customer.avatar
      },
      consultant: {
        id: session.consultant._id,
        name: session.consultant.name,
        avatar: session.consultant.avatar,
        ratingAverage: session.consultant.consultantProfile.ratingAverage,
        totalSessions: session.consultant.consultantProfile.totalSessions
      },
      timing: {
        requestedAt: session.requestedAt,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        durationMinutes: session.durationMinutes
      },
      billing: {
        ratePerMinute: session.ratePerMinute,
        totalCost: session.totalCost,
        bonusUsed: session.bonusUsed,
        mainWalletUsed: session.mainWalletUsed,
        platformCommission: session.platformCommission,
        consultantEarning: session.consultantEarning
      },
      communication: {
        lastMessageAt: session.lastMessageAt,
        messageCount: session.messageCount
      },
      feedback: {
        customerRating: session.customerRating,
        consultantRating: session.consultantRating
      },
      metadata: {
        endedBy: session.endedBy,
        endReason: session.endReason,
        lastActivity: session.lastActivity
      }
    };

    return res.status(200).json({
      success: true,
      message: 'Session details retrieved successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Get session details error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve session details',
      data: null
    });
  }
};

/**
 * End session
 * @route POST /api/user/session/:id/end
 * @desc End an ongoing session
 * @access Private (Session participants only)
 */

export const endSession = async (req, res) => {
  try {
    const { id: sessionId } = req.params;
    const { reason = 'natural' } = req.body;
    const userId = req.user.userId;

    // Find session
    const session = await Session.findById(sessionId)
      .populate('customer', 'name wallet')
      .populate('consultant', 'name consultantProfile');

    if (!session) {
      return res.status(200).json({
        success: false,
        message: 'Session not found',
        data: null
      });
    }

    // Check if user is participant
    if (session.customer._id.toString() !== userId && session.consultant._id.toString() !== userId) {
      return res.status(200).json({
        success: false,
        message: 'Unauthorized to end this session',
        data: null
      });
    }

    // Check if session can be ended
    if (!['pending', 'ongoing'].includes(session.status)) {
      return res.status(200).json({
        success: false,
        message: `Cannot end session. Current status: ${session.status}`,
        data: null
      });
    }

    // Determine who is ending the session
    const endedBy = session.customer._id.toString() === userId ? 'customer' : 'consultant';

    // Stop billing service and get final billing data
    let finalBilling = null;
    if (session.status === 'ongoing' && session.startedAt) {
      try {
        // Stop billing service - this handles final billing calculation
        // finalBilling = await billingService.stopBilling(sessionId);
      } catch (billingError) {
        console.error('Billing stop error:', billingError);
        // Continue with manual calculation as fallback
      }
    }

    // Calculate final billing (fallback or if billing service wasn't used)
    if (session.status === 'ongoing' && session.startedAt) {
      const endTime = new Date();
      
      // Use billing service data if available, otherwise calculate manually
      const durationMinutes = finalBilling?.durationMinutes || 
        Math.ceil((endTime - session.startedAt) / (1000 * 60));
      const totalCost = finalBilling?.totalCost || 
        (durationMinutes * session.ratePerMinute);

      // Calculate platform commission
      const commissionPercent = await settingsService.getSetting('platformCommissionPercent');
      const platformCommission = (totalCost * commissionPercent) / 100;
      const consultantEarning = totalCost - platformCommission;

      // Update session with final billing
      session.endedAt = endTime;
      session.durationMinutes = durationMinutes;
      session.totalCost = totalCost;
      session.platformCommission = platformCommission;
      session.consultantEarning = consultantEarning;
      session.status = 'completed';
      session.endedBy = endedBy;
      session.endReason = reason;

      // Note: Wallet deduction was already handled by billing service
      // But we need to add consultant earnings and update stats
      const customer = await User.findById(session.customer._id);
      const consultant = await User.findById(session.consultant._id);

      // Get wallet usage info (if billing service didn't track it)
      if (!finalBilling) {
        // Manual wallet deduction (fallback)
        let remainingCost = totalCost;
        let bonusUsed = 0;
        let mainWalletUsed = 0;

        // Use bonus wallet first
        if (customer.wallet.bonus >= remainingCost) {
          bonusUsed = remainingCost;
          customer.wallet.bonus -= bonusUsed;
          remainingCost = 0;
        } else if (customer.wallet.bonus > 0) {
          bonusUsed = customer.wallet.bonus;
          customer.wallet.bonus = 0;
          remainingCost -= bonusUsed;
        }

        // Use main wallet for remaining amount
        if (remainingCost > 0) {
          mainWalletUsed = Math.min(customer.wallet.main, remainingCost);
          customer.wallet.main -= mainWalletUsed;
        }

        session.bonusUsed = bonusUsed;
        session.mainWalletUsed = mainWalletUsed;

        await customer.save();
      }

      // Add to consultant earnings and update stats
      consultant.consultantProfile.wallet.pending += consultantEarning;
      consultant.consultantProfile.totalSessions += 1;
      
      // Update consultant availability back to onWork
      consultant.consultantProfile.availabilityStatus = 'onWork';
      await consultant.save();

    } else {
      // Session ended before starting or was pending
      session.endedAt = new Date();
      session.status = session.status === 'pending' ? 'cancelled' : 'completed';
      session.endedBy = endedBy;
      session.endReason = reason;

      // Update consultant availability
      const consultant = await User.findById(session.consultant._id);
      consultant.consultantProfile.availabilityStatus = 'onWork';
      await consultant.save();
    }

    await session.save();

    // Notify both participants via socket
    if (socketHandler.io) {
      const endNotification = {
        sessionId: session._id,
        status: session.status,
        endedBy: endedBy,
        endReason: reason,
        endedAt: session.endedAt,
        billing: session.status === 'completed' ? {
          durationMinutes: session.durationMinutes,
          totalCost: session.totalCost,
          bonusUsed: session.bonusUsed,
          mainWalletUsed: session.mainWalletUsed
        } : null
      };

      // Notify customer
      socketHandler.io.to(`user_${session.customer._id}`).emit('session:ended', {
        ...endNotification,
        message: session.status === 'completed' 
          ? `Session completed. Duration: ${session.durationMinutes} minutes, Cost: $${session.totalCost}`
          : 'Session ended',
        consultantAvailable: true // Consultant is now available again
      });

      // Notify consultant
      socketHandler.io.to(`user_${session.consultant._id}`).emit('session:ended', {
        ...endNotification,
        message: session.status === 'completed'
          ? `Session completed. You earned: $${session.consultantEarning}`
          : 'Session ended',
        earnings: session.consultantEarning || 0
      });
    }

    // Prepare response
    const responseData = {
      sessionId: session._id,
      conversationId: session.conversationId,
      status: session.status,
      endedAt: session.endedAt,
      endedBy: session.endedBy,
      endReason: session.endReason,
      billing: session.status === 'completed' ? {
        durationMinutes: session.durationMinutes,
        totalCost: session.totalCost,
        bonusUsed: session.bonusUsed,
        mainWalletUsed: session.mainWalletUsed,
        platformCommission: session.platformCommission,
        consultantEarning: session.consultantEarning
      } : null,
      participants: {
        customer: {
          id: session.customer._id,
          name: session.customer.name,
          remainingBalance: session.customer.wallet.main + session.customer.wallet.bonus
        },
        consultant: {
          id: session.consultant._id,
          name: session.consultant.name,
          availabilityStatus: 'onWork' // Now available again
        }
      }
    };

    return res.status(200).json({
      success: true,
      message: session.status === 'completed' 
        ? `Session completed successfully. Duration: ${session.durationMinutes} minutes.`
        : 'Session ended successfully',
      data: responseData
    });

  } catch (error) {
    console.error('End session error:', error);

    // Try to stop billing service even if other operations failed
    try {
      if (req.params.id) {
        // await billingService.stopBilling(req.params.id);
        console.log("Hello")
      }
    } catch (billingCleanupError) {
      console.error('Billing cleanup error:', billingCleanupError);
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to end session',
      data: null
    });
  }
};