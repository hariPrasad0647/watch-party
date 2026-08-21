import { logger } from '../logger/index.js';

// We do not create active BullMQ instances yet as there are no jobs.
// This serves as the foundation to attach queues and workers when required.

export async function closeQueues() {
  logger.info('Queue resources closed (no active queues currently)');
}
