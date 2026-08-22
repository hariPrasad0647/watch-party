import { describe, it, expect, vi, beforeEach } from 'vitest';
import { outboxRelay } from '../../src/modules/notifications/outbox.relay.js';
import { notificationQueue } from '../../src/modules/notifications/notification.queue.js';
import { prisma } from '../../src/infrastructure/database/index.js';
import { notificationWorker } from '../../src/modules/notifications/notification.worker.js';

vi.mock('../../src/infrastructure/database/index.js', () => ({
  prisma: {
    $transaction: vi.fn(),
    outboxEvent: {
      update: vi.fn()
    }
  }
}));

vi.mock('../../src/modules/notifications/notification.queue.js', () => ({
  notificationQueue: {
    add: vi.fn()
  }
}));

describe('Module 8: Notifications Infrastructure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Outbox Relay', () => {
    it('should process pending outbox events', async () => {
      // Mock the transaction to execute the callback and pass a fake transaction object
      const mockEvents = [
        { id: 'event-1', type: 'TEST_EVENT', payload: { test: true }, attempts: 0 }
      ];
      
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue(mockEvents),
        outboxEvent: {
          update: vi.fn().mockResolvedValue({})
        }
      };

      (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(mockTx));
      (notificationQueue.add as any).mockResolvedValue({});

      await outboxRelay.processOutbox();

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockTx.$queryRaw).toHaveBeenCalled(); // Should attempt to query for unprocessed events
      expect(notificationQueue.add).toHaveBeenCalledWith(
        'TEST_EVENT',
        {
          outboxEventId: 'event-1',
          type: 'TEST_EVENT',
          payload: { test: true }
        },
        expect.any(Object)
      );
      
      expect(mockTx.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: expect.objectContaining({
          attempts: { increment: 1 }
        })
      });
    });
    
    it('should handle enqueue failures gracefully without marking processed', async () => {
      const mockEvents = [
        { id: 'event-2', type: 'TEST_EVENT', payload: {}, attempts: 0 }
      ];
      
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue(mockEvents),
        outboxEvent: {
          update: vi.fn().mockResolvedValue({})
        }
      };

      (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(mockTx));
      (notificationQueue.add as any).mockRejectedValue(new Error('Redis Down'));

      await outboxRelay.processOutbox();

      // Ensure we increment attempts but also record the last error, NOT processedAt
      expect(mockTx.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'event-2' },
        data: expect.objectContaining({
          attempts: { increment: 1 },
          lastError: 'Redis Down'
        })
      });
      // Ensure processedAt is not in the object (not updated to Date)
      const callArgs = (mockTx.outboxEvent.update as any).mock.calls[0][0];
      expect(callArgs.data.processedAt).toBeUndefined();
    });
  });
});
