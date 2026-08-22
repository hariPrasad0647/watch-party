import { prisma } from '../../infrastructure/database/index.js';
import { notificationQueue } from './notification.queue.js';
import { logger } from '../../infrastructure/logger/index.js';

export class OutboxRelay {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private intervalMs: number;

  constructor(intervalMs: number = 5000) {
    this.intervalMs = intervalMs;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.processOutbox(), this.intervalMs);
    logger.info(`[OutboxRelay] Started pulling outbox events every ${this.intervalMs}ms`);
    // Run immediately on start
    this.processOutbox();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async processOutbox() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Execute the entire claim-and-update process inside a transaction
      await prisma.$transaction(async (tx) => {
        // 1. Claim a batch of unprocessed events safely using SKIP LOCKED
        const events = await tx.$queryRaw<any[]>`
          SELECT id, type, payload, attempts
          FROM "OutboxEvent"
          WHERE "processedAt" IS NULL
          ORDER BY "createdAt" ASC
          LIMIT 10
          FOR UPDATE SKIP LOCKED;
        `;

        if (events.length === 0) {
          return;
        }

        logger.debug(`[OutboxRelay] Claimed ${events.length} outbox events`);

        // 2. Process each event
        for (const event of events) {
          let lastError: string | null = null;
          let successfullyEnqueued = false;

          try {
            // Enqueue to BullMQ
            await notificationQueue.add(
              event.type,
              {
                outboxEventId: event.id,
                type: event.type,
                payload: event.payload
              },
              {
                jobId: `outbox-${event.id}`, // Add BullMQ dedup key
                attempts: 5,
                backoff: { type: 'exponential', delay: 1000 }
              }
            );
            successfullyEnqueued = true;
          } catch (error: any) {
            logger.error({ err: error, eventId: event.id }, '[OutboxRelay] Failed to enqueue event to BullMQ');
            lastError = error.message;
          }

          // 3. Mark processed or update attempts within the SAME transaction
          if (successfullyEnqueued) {
            await tx.outboxEvent.update({
              where: { id: event.id },
              data: {
                processedAt: new Date(),
                attempts: { increment: 1 },
                lastAttemptAt: new Date()
              }
            });
          } else {
            await tx.outboxEvent.update({
              where: { id: event.id },
              data: {
                attempts: { increment: 1 },
                lastAttemptAt: new Date(),
                lastError
              }
            });
          }
        }
      });
    } catch (error) {
      logger.error({ err: error }, '[OutboxRelay] Error during processOutbox execution');
    } finally {
      this.isProcessing = false;
    }
  }
}

// Export a singleton instance
export const outboxRelay = new OutboxRelay();
