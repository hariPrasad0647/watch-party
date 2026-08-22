import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { buildApp } from '../../src/app.js';
import { FastifyInstance } from 'fastify';
import { TokenService } from '../../src/modules/auth/token.service.js';
import { env } from '../../src/config/env.js';
import { InvitationRepository } from '../../src/modules/invitations/invitation.repository.js';
import { RoomRepository } from '../../src/modules/rooms/room.repository.js';
import { ParticipantRepository } from '../../src/modules/participants/participant.repository.js';

vi.mock('../../src/modules/invitations/invitation.repository.js', () => ({
  InvitationRepository: {
    createInvitation: vi.fn(),
    findInvitationByTokenHash: vi.fn(),
    findInvitationsByRoomId: vi.fn(),
    findInvitationById: vi.fn(),
    revokeInvitation: vi.fn(),
  }
}));

vi.mock('../../src/modules/rooms/room.repository.js', () => ({
  RoomRepository: {
    findById: vi.fn()
  }
}));

vi.mock('../../src/modules/participants/participant.repository.js', () => ({
  ParticipantRepository: {
    atomicJoin: vi.fn(),
    getPrisma: vi.fn()
  }
}));

vi.mock('../../src/infrastructure/redis/index.js', () => ({
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn()
}));

describe('Invitation API (Module 7)', () => {
  let app: FastifyInstance;
  const hostId = 'host-123';
  const guestId = 'guest-456';
  let hostToken: string;
  let guestToken: string;
  const roomId = '11111111-1111-1111-1111-111111111111';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    hostToken = TokenService.generateAccessToken(hostId, 'host-jti');
    guestToken = TokenService.generateAccessToken(guestId, 'guest-jti');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/rooms/:roomId/invitations', () => {
    it('should allow host to create an invitation for private room', async () => {
      (RoomRepository.findById as any).mockResolvedValue({ id: roomId, hostId, isPrivate: true, status: 'ACTIVE' });
      
      (InvitationRepository.createInvitation as any).mockResolvedValue({
        id: 'inv-123',
        roomId,
        hostId,
        tokenHash: 'hash',
        maxUses: 5,
        useCount: 0,
        expiresAt: new Date(Date.now() + 3600000)
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/rooms/${roomId}/invitations`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: { maxUses: 5 }
      });

      if (response.statusCode !== 201) {
        console.error('CREATE INVITE FAILED:', response.payload);
      }

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.token).toBeDefined();
    });

    it('should prevent non-host from creating an invitation', async () => {
      (RoomRepository.findById as any).mockResolvedValue({ id: roomId, hostId, isPrivate: true, status: 'ACTIVE' });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/rooms/${roomId}/invitations`,
        headers: { authorization: `Bearer ${guestToken}` },
        payload: { maxUses: 5 }
      });

      expect(response.statusCode).toBe(403);
    });

    it('should forbid invitations on public rooms', async () => {
      (RoomRepository.findById as any).mockResolvedValue({ id: roomId, hostId, isPrivate: false, status: 'ACTIVE' });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/rooms/${roomId}/invitations`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: { maxUses: 5 }
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('INVITATION_FORBIDDEN');
    });
  });

  describe('POST /api/v1/invitations/:token/accept', () => {
    it('should successfully accept a valid invitation', async () => {
      // We must mock ParticipantRepository.getPrisma since InvitationService uses it to start a transaction
      const mockPrismaTx = {
        invitation: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'inv-123',
            roomId,
            maxUses: 1,
            useCount: 0,
            expiresAt: new Date(Date.now() + 3600000),
            revokedAt: null
          })
        },
        room: {
          findUnique: vi.fn().mockResolvedValue({
            id: roomId,
            maxParticipants: 10,
            status: 'ACTIVE'
          })
        },
        $queryRaw: vi.fn().mockResolvedValue([{
            id: 'inv-123',
            useCount: 0,
            maxUses: 1,
            expiresAt: new Date(Date.now() + 3600000),
            revokedAt: null
        }])
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (cb) => {
          return cb(mockPrismaTx);
        })
      };

      (InvitationRepository.findInvitationByTokenHash as any).mockResolvedValue({
        id: 'inv-123',
        roomId,
        maxUses: 1,
        useCount: 0,
        expiresAt: new Date(Date.now() + 3600000),
        revokedAt: null
      });

      (ParticipantRepository.getPrisma as any).mockReturnValue(mockPrisma);
      (ParticipantRepository.atomicJoin as any).mockImplementation(async (roomId, userId, opts) => {
        if (opts && opts.beforeRoomLock) {
          await opts.beforeRoomLock(mockPrismaTx, false);
        }
        return { participant: { roomId, userId: guestId }, isNew: true };
      });

      // Because atomicJoin handles the actual update to invitation, the service relies on the hook executing it.
      // But in our mock transaction, we just simulate success.
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/invitations/rawtoken123/accept',
        headers: { authorization: `Bearer ${guestToken}` }
      });

      if (response.statusCode !== 200) {
        console.error('ACCEPT INVITE FAILED:', response.payload);
      }

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.roomId).toBe(roomId);
    });
    
    it('should reject an exhausted invitation', async () => {
      const mockPrismaTx = {
        invitation: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'inv-123',
            roomId,
            maxUses: 1,
            useCount: 1, // exhausted
            expiresAt: new Date(Date.now() + 3600000),
            revokedAt: null
          })
        },
        $queryRaw: vi.fn().mockResolvedValue([{
            id: 'inv-123',
            useCount: 1,
            maxUses: 1,
            expiresAt: new Date(Date.now() + 3600000),
            revokedAt: null
        }])
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (cb) => {
          return cb(mockPrismaTx);
        })
      };

      (InvitationRepository.findInvitationByTokenHash as any).mockResolvedValue({
        id: 'inv-123',
        roomId,
        maxUses: 1,
        useCount: 1,
        expiresAt: new Date(Date.now() + 3600000),
        revokedAt: null
      });

      (ParticipantRepository.getPrisma as any).mockReturnValue(mockPrisma);
      (ParticipantRepository.atomicJoin as any).mockImplementation(async (roomId, userId, opts) => {
        if (opts && opts.beforeRoomLock) {
          await opts.beforeRoomLock(mockPrismaTx, false);
        }
        return { participant: { roomId, userId: guestId }, isNew: true };
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/invitations/rawtoken123/accept',
        headers: { authorization: `Bearer ${guestToken}` }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('INVITATION_EXHAUSTED');
    });
  });
});
