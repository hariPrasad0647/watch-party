import { Queue } from 'bullmq';
import { redis } from '../../infrastructure/redis/index.js';
import { logger } from '../../infrastructure/logger/index.js';

export const NOTIFICATION_QUEUE_NAME = 'notification_queue';

export const notificationQueue = new Queue(NOTIFICATION_QUEUE_NAME, {
  connection: redis
});

notificationQueue.on('error', (err) => {
  logger.error({ err }, 'Notification queue error');
});
