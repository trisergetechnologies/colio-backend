import cron from 'node-cron';
import CommunicationSession from '../models/CommunicationSession.js';
import { billOneMinute } from '../services/sessionBilling.service.js';


export function startSessionBillingJob() {
  cron.schedule('* * * * *', async () => {
    const sessions = await CommunicationSession.find({
      status: 'active',
      startedAt: { $ne: null },
      endedAt: null
    });
    console.log("cron started");
    const now = new Date();
    console.log(now);
    for (const session of sessions) {
      const last = session.lastBilledAt || session.startedAt;
      const diffSeconds = (now - last) / 1000;

      if (diffSeconds >= 60) {
        await billOneMinute(session._id);
      }
    }
  });
}
