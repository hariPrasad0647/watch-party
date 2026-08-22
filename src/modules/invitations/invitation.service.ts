import crypto from 'crypto';
import { InvitationRepository } from './invitation.repository.js';
import { RoomRepository } from '../rooms/room.repository.js';
import { ParticipantRepository } from '../participants/participant.repository.js';
import { RateLimiter } from '../../infrastructure/redis/rate-limiter.js';
import { CreateInvitationInput } from './invitation.schema.js';
import { 
  AppError, 
  RoomNotFoundError, 
  RoomForbiddenError, 
  InvitationInvalidError,
  InvitationExpiredError,
  InvitationRevokedError,
  InvitationExhaustedError,
  InvitationForbiddenError
} from '../../common/errors/index.js';
import { Prisma } from '@prisma/client';

export class InvitationService {
  /**
   * Generates a secure random 32-byte token and returns both the raw token (for the client)
   * and the sha256 hash (for the DB).
   */
  private static generateToken() {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return { rawToken, tokenHash };
  }

  static async createInvitation(hostId: string, roomId: string, input: CreateInvitationInput) {
    // 1. Rate limiting (10 per minute per host per room)
    const rateLimitKey = `ratelimit:invitation:create:${roomId}:${hostId}`;
    const allowed = await RateLimiter.checkLimit(rateLimitKey, 10, 60);
    if (!allowed) {
      throw new AppError('Rate limit exceeded for creating invitations', 429, 'RATE_LIMIT_EXCEEDED');
    }

    // 2. Authorize
    const room = await RoomRepository.findById(roomId);
    if (!room) {
      throw new RoomNotFoundError();
    }
    if (room.hostId !== hostId) {
      throw new RoomForbiddenError('Only the host can create invitations');
    }
    if (!room.isPrivate) {
      throw new InvitationForbiddenError();
    }
    if (room.status !== 'ACTIVE') {
      throw new AppError('Cannot create invitations for an ended room', 400, 'ROOM_INVALID_STATE');
    }

    // 3. Generate token
    const { rawToken, tokenHash } = this.generateToken();

    let expiresAt: Date | null = null;
    if (input.expiresInSeconds) {
      expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + input.expiresInSeconds);
    }

    // 4. Persist
    const invitation = await InvitationRepository.createInvitation({
      roomId,
      createdById: hostId,
      tokenHash,
      expiresAt,
      maxUses: input.maxUses || null
    });

    return {
      invitationId: invitation.id,
      token: rawToken,
      expiresAt: invitation.expiresAt?.toISOString() || null
    };
  }

  static async listInvitations(hostId: string, roomId: string, page: number, limit: number) {
    const room = await RoomRepository.findById(roomId);
    if (!room) throw new RoomNotFoundError();
    if (room.hostId !== hostId) throw new RoomForbiddenError('Only the host can view invitations');

    const result = await InvitationRepository.findInvitationsByRoomId(roomId, page, limit);

    const items = result.invitations.map(inv => {
      let status = 'ACTIVE';
      if (inv.revokedAt) status = 'REVOKED';
      else if (inv.expiresAt && new Date() >= inv.expiresAt) status = 'EXPIRED';
      else if (inv.maxUses && inv.useCount >= inv.maxUses) status = 'EXHAUSTED';

      return {
        id: inv.id,
        roomId: inv.roomId,
        createdAt: inv.createdAt.toISOString(),
        expiresAt: inv.expiresAt?.toISOString() || null,
        maxUses: inv.maxUses,
        useCount: inv.useCount,
        revokedAt: inv.revokedAt?.toISOString() || null,
        status
      };
    });

    return { items, total: result.total, page, limit };
  }

  static async revokeInvitation(hostId: string, roomId: string, invitationId: string) {
    const room = await RoomRepository.findById(roomId);
    if (!room) throw new RoomNotFoundError();
    if (room.hostId !== hostId) throw new RoomForbiddenError('Only the host can revoke invitations');

    const invitation = await InvitationRepository.findInvitationById(invitationId);
    if (!invitation || invitation.roomId !== roomId) {
      throw new AppError('Invitation not found', 404, 'INVITATION_NOT_FOUND');
    }

    if (invitation.revokedAt) {
      return; // Idempotent
    }

    await InvitationRepository.revokeInvitation(invitationId);
  }

  static async acceptInvitation(userId: string, rawToken: string) {
    // 1. Rate limiting (5 per minute per user)
    const rateLimitKey = `ratelimit:invitation:accept:${userId}`;
    const allowed = await RateLimiter.checkLimit(rateLimitKey, 5, 60);
    if (!allowed) {
      throw new AppError('Rate limit exceeded for accepting invitations', 429, 'RATE_LIMIT_EXCEEDED');
    }

    // 2. Hash token & lookup
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const invitation = await InvitationRepository.findInvitationByTokenHash(tokenHash);

    if (!invitation) {
      throw new InvitationInvalidError();
    }

    // We do basic pre-checks here to fail fast, but we'll check strictly under lock in the transaction
    if (invitation.revokedAt) throw new InvitationRevokedError();
    if (invitation.expiresAt && new Date() >= invitation.expiresAt) throw new InvitationExpiredError();

    // 3. Perform atomic join using existing capability
    const result = await ParticipantRepository.atomicJoin(
      invitation.roomId,
      userId,
      {
        beforeRoomLock: async (tx, isExisting) => {
          // If they already have an existing participant record (active or former), 
          // we do NOT consume an invitation use. It is a no-op fallback to join.
          if (isExisting) {
            return;
          }

          // Lock invitation to serialize uses
          const invites = await tx.$queryRaw<any[]>`
            SELECT id, "useCount", "maxUses", "expiresAt", "revokedAt"
            FROM "Invitation"
            WHERE id = ${invitation.id}
            FOR UPDATE
          `;

          if (invites.length === 0) {
            throw new InvitationInvalidError();
          }

          const lockedInv = invites[0];

          if (lockedInv.revokedAt) throw new InvitationRevokedError();
          if (lockedInv.expiresAt && new Date() >= new Date(lockedInv.expiresAt)) throw new InvitationExpiredError();
          if (lockedInv.maxUses !== null && lockedInv.useCount >= lockedInv.maxUses) throw new InvitationExhaustedError();
        },
        afterCapacityCheck: async (tx, isExisting) => {
          // Only increment useCount for new participants
          if (!isExisting) {
            await tx.invitation.update({
              where: { id: invitation.id },
              data: { useCount: { increment: 1 } }
            });
          }
        }
      }
    );

    if (!result) {
      throw new AppError('Room has reached maximum capacity', 400, 'ROOM_FULL');
    }

    return {
      roomId: invitation.roomId,
      participantId: result.participant.id,
      isNew: result.isNew
    };
  }
}
