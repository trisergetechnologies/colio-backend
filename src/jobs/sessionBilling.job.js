import cron from 'node-cron';
import CommunicationSession from '../models/CommunicationSession.js';
import { billOneMinute } from '../services/sessionBilling.service.js';

export function startSessionBillingJob() {
  // ✅ Run every 30 seconds for faster detection
  cron.schedule('*/30 * * * * *', async () => {
    try {
      const sessions = await CommunicationSession.find({
        status: 'active',
        startedAt: { $ne: null },
        endedAt: null
      });

      if (sessions.length === 0) return;

      console.log("⏰ Cron check:", new Date().toISOString(), "Active sessions:", sessions.length);

      const now = new Date();

      for (const session of sessions) {
        const last = session.lastBilledAt || session.startedAt;
        const diffSeconds = (now - last) / 1000;

        console.log(`  Session ${session._id}: ${Math.floor(diffSeconds)}s since last bill`);

        // ✅ Bill if 60+ seconds have passed
        if (diffSeconds >= 60) {
          await billOneMinute(session._id);
        }
      }
    } catch (err) {
      console.error("❌ Cron error:", err);
    }
  });

  console.log("✅ Session billing cron started (every 30 seconds)");
}