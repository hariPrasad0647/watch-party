import { Worker, Job } from 'bullmq';
import { redis } from '../../infrastructure/redis/index.js';
import { logger } from '../../infrastructure/logger/index.js';
import { NOTIFICATION_QUEUE_NAME } from './notification.queue.js';
import { ConsoleEmailProvider } from './providers/console.provider.js';

const emailProvider = new ConsoleEmailProvider();

export interface NotificationJobData {
  outboxEventId: string;
  type: string;
  payload: any;
}

export const notificationWorker = new Worker<NotificationJobData>(
  NOTIFICATION_QUEUE_NAME,
  async (job: Job<NotificationJobData>) => {
    const { outboxEventId, type, payload } = job.data;
    
    logger.info({ outboxEventId, type }, `[NotificationWorker] Processing job ${job.id}`);
    
    try {
      if (type === 'ROOM_INVITATION_CREATED') {
        const { toEmail, inviteUrl, roomName, hostName } = payload;
        
        if (!toEmail) {
          logger.warn({ outboxEventId }, 'ROOM_INVITATION_CREATED missing toEmail');
          return;
        }

        const subject = `You are invited to join ${roomName || 'a private room'}`;
        const body = `Hello,\n\n${hostName || 'A user'} has invited you to a Watch Party room.\n\nJoin here: ${inviteUrl}\n\nThanks!`;
        
        await emailProvider.sendEmail(toEmail, subject, body);
      } else if (type === 'ACCOUNT_SECURITY_ALERT') {
        const { toEmail, action, timestamp } = payload;
        
        if (!toEmail) {
          logger.warn({ outboxEventId }, 'ACCOUNT_SECURITY_ALERT missing toEmail');
          return;
        }

        const subject = `Security Alert: ${action}`;
        const body = `We noticed a security event on your account: ${action} at ${timestamp}.\n\nIf this was you, you can ignore this email.`;
        
        await emailProvider.sendEmail(toEmail, subject, body);
      } else {
        logger.warn({ type, outboxEventId }, `Unknown notification event type: ${type}`);
      }
      
      logger.info({ outboxEventId }, `[NotificationWorker] Finished job ${job.id}`);
    } catch (error) {
      logger.error({ err: error, outboxEventId }, `[NotificationWorker] Failed job ${job.id}`);
      throw error; // Let BullMQ handle retries
    }
  },
  {
    connection: redis,
    concurrency: 5, // process up to 5 jobs concurrently
    autorun: false // we will start it manually when app starts
  }
);

notificationWorker.on('failed', (job, err) => {
  logger.error({ err, jobId: job?.id }, 'Worker failed a job');
});
