import { Participant, Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/index.js';
import { RoomNotFoundError, RoomInvalidStateError } from '../../common/errors/index.js';

export class ParticipantRepository {
  static getPrisma() {
    return prisma;
  }

  /**
   * Idempotent atomic join.
   * If the participant already exists and is active (leftAt = null), returns { participant, isNew: false }.
   * If capacity is full, returns null.
   * Otherwise increments room capacity and creates/reactivates participant.
   */
  static async atomicJoin(
    roomId: string, 
    userId: string,
    hooks?: {
      beforeRoomLock?: (tx: Prisma.TransactionClient, isExisting: boolean) => Promise<void>;
      afterCapacityCheck?: (tx: Prisma.TransactionClient, isExisting: boolean) => Promise<void>;
    }
  ): Promise<{ participant: Participant; isNew: boolean } | null> {
    // We use a serialized transaction for capacity enforcement
    return prisma.$transaction(async (tx) => {
      // 1. Check existing participant state
      const existing = await tx.participant.findUnique({
        where: { roomId_userId: { roomId, userId } }
      });

      if (existing && existing.leftAt === null) {
        // Already an active participant, idempotent success
        return { participant: existing, isNew: false };
      }

      if (hooks?.beforeRoomLock) {
        await hooks.beforeRoomLock(tx as Prisma.TransactionClient, !!existing);
      }

      // 2. Lock the room row to serialize concurrent joins
      // We use raw SQL to lock the row FOR UPDATE and ensure it's ACTIVE
      const rooms = await tx.$queryRaw<any[]>`
        SELECT id, status, "activeParticipantCount", "maxParticipants"
        FROM "Room"
        WHERE id = ${roomId}
        FOR UPDATE
      `;

      if (rooms.length === 0) {
        throw new RoomNotFoundError();
      }

      const room = rooms[0];

      if (room.status !== 'ACTIVE') {
        throw new RoomInvalidStateError('Room is not active');
      }

      if (room.activeParticipantCount >= room.maxParticipants) {
        // Room is full
        return null;
      }

      if (hooks?.afterCapacityCheck) {
        await hooks.afterCapacityCheck(tx as Prisma.TransactionClient, !!existing);
      }

      // 3. Increment the counter
      await tx.room.update({
        where: { id: roomId },
        data: { activeParticipantCount: { increment: 1 } }
      });

      // 4. Create or reactivate participant
      const participant = await tx.participant.upsert({
        where: { roomId_userId: { roomId, userId } },
        create: {
          roomId,
          userId,
          joinedAt: new Date(),
          leftAt: null
        },
        update: {
          leftAt: null, // Reactivate
          joinedAt: new Date() // Reset joined time upon re-entry? Or keep original? The spec says create/reactivate. Usually we update joinedAt.
        }
      });

      return { participant, isNew: true };
    });
  }

  /**
   * Idempotent atomic leave.
   * Returns true if a leave occurred, false if they were already left/not a participant.
   */
  static async atomicLeave(roomId: string, userId: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.participant.findUnique({
        where: { roomId_userId: { roomId, userId } }
      });

      if (!existing || existing.leftAt !== null) {
        return false; // Already left or never joined
      }

      // Lock room to decrement safely
      const rooms = await tx.$queryRaw<any[]>`
        SELECT id, "activeParticipantCount"
        FROM "Room"
        WHERE id = ${roomId}
        FOR UPDATE
      `;

      if (rooms.length > 0) {
        const room = rooms[0];
        if (room.activeParticipantCount > 0) {
          await tx.room.update({
            where: { id: roomId },
            data: { activeParticipantCount: { decrement: 1 } }
          });
        }
      }

      await tx.participant.update({
        where: { roomId_userId: { roomId, userId } },
        data: { leftAt: new Date() }
      });

      return true;
    });
  }

  /**
   * Returns a list of currently active participants (leftAt IS NULL)
   */
  static async findActiveParticipants(roomId: string) {
    return prisma.participant.findMany({
      where: {
        roomId,
        leftAt: null
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        }
      },
      orderBy: {
        joinedAt: 'asc'
      }
    });
  }
}
