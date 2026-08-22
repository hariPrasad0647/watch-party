import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { buildApp } from '../../src/app.js';
import { FastifyInstance } from 'fastify';
import { ParticipantRepository } from '../../src/modules/participants/participant.repository.js';
import { RoomRepository } from '../../src/modules/rooms/room.repository.js';
import { TokenService } from '../../src/modules/auth/token.service.js';
import { RealtimeService } from '../../src/realtime/realtime.service.js';
import { connectRedis, disconnectRedis } from '../../src/infrastructure/redis/index.js';

// Mock Repositories and RealtimeService
vi.mock('../../src/modules/participants/participant.repository.js', () => ({
  ParticipantRepository: {
    atomicJoin: vi.fn(),
    atomicLeave: vi.fn(),
    findActiveParticipants: vi.fn(),
    getPrisma: vi.fn()
  }
}));

vi.mock('../../src/modules/rooms/room.repository.js', () => ({
  RoomRepository: {
    findById: vi.fn(),
    endRoomAtomic: vi.fn()
  }
}));

vi.mock('../../src/realtime/realtime.service.js', () => ({
  RealtimeService: {
    broadcastToRoom: vi.fn(),
    disconnectAllFromRoom: vi.fn(),
    getActiveSocketCount: vi.fn(),
    removeUserFromRoom: vi.fn()
  }
}));

describe('Participants Module (Module 4)', () => {
  let app: FastifyInstance;
  const hostId = 'host-123';
  const guestId = 'guest-456';
  let validToken: string;
  let guestToken: string;

  beforeAll(async () => {
    // await connectRedis();
    app = await buildApp();
    await app.ready();

    validToken = TokenService.generateAccessToken(hostId, 'host-jti');
    guestToken = TokenService.generateAccessToken(guestId, 'guest-jti');
  });

  afterAll(async () => {
    await app.close();
    // await disconnectRedis();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/rooms/:roomId/join', () => {
    it('should successfully join a public room', async () => {
      const mockRoom = { id: '11111111-1111-1111-1111-111111111111', status: 'ACTIVE', isPrivate: false, hostId };
      const mockParticipant = { roomId: '11111111-1111-1111-1111-111111111111', userId: guestId, joinedAt: new Date() };

      (RoomRepository.findById as any).mockResolvedValue(mockRoom);
      (ParticipantRepository.atomicJoin as any).mockResolvedValue({ participant: mockParticipant, isNew: true });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/rooms/11111111-1111-1111-1111-111111111111/join',
        headers: { authorization: `Bearer ${guestToken}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(RealtimeService.broadcastToRoom).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', 'participant:joined', expect.any(Object));
    });

    it('should fail to join if room is full', async () => {
      const mockRoom = { id: '11111111-1111-1111-1111-111111111111', status: 'ACTIVE', isPrivate: false, hostId };
      
      (RoomRepository.findById as any).mockResolvedValue(mockRoom);
      (ParticipantRepository.atomicJoin as any).mockResolvedValue(null); // Simulated full room

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/rooms/11111111-1111-1111-1111-111111111111/join',
        headers: { authorization: `Bearer ${guestToken}` }
      });

      console.log('500 ERROR BODY:', response.payload);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('ROOM_FULL');
      expect(RealtimeService.broadcastToRoom).not.toHaveBeenCalled();
    });

    it('should allow host to join a private room', async () => {
      const mockRoom = { id: '11111111-1111-1111-1111-111111111111', status: 'ACTIVE', isPrivate: true, hostId };
      const mockParticipant = { roomId: mockRoom.id, userId: hostId, joinedAt: new Date() };
      (RoomRepository.findById as any).mockResolvedValue(mockRoom);
      (ParticipantRepository.atomicJoin as any).mockResolvedValue({ participant: mockParticipant, isNew: true });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/rooms/11111111-1111-1111-1111-111111111111/join',
        headers: { authorization: `Bearer ${validToken}` }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject non-host from joining a private room', async () => {
      const mockRoom = { id: '11111111-1111-1111-1111-111111111111', status: 'ACTIVE', isPrivate: true, hostId };
      (RoomRepository.findById as any).mockResolvedValue(mockRoom);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/rooms/11111111-1111-1111-1111-111111111111/join',
        headers: { authorization: `Bearer ${guestToken}` }
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('ROOM_JOIN_FORBIDDEN');
    });

    it('should be idempotent for duplicate joins', async () => {
      const mockRoom = { id: '11111111-1111-1111-1111-111111111111', status: 'ACTIVE', isPrivate: false, hostId };
      const mockParticipant = { roomId: mockRoom.id, userId: guestId, joinedAt: new Date() };
      (RoomRepository.findById as any).mockResolvedValue(mockRoom);
      // isNew: false means they were already active
      (ParticipantRepository.atomicJoin as any).mockResolvedValue({ participant: mockParticipant, isNew: false });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/rooms/11111111-1111-1111-1111-111111111111/join',
        headers: { authorization: `Bearer ${guestToken}` }
      });

      expect(response.statusCode).toBe(200);
      expect(RealtimeService.broadcastToRoom).not.toHaveBeenCalled(); // No event emitted
    });
  });

  describe('POST /api/v1/rooms/:roomId/leave', () => {
    it('should leave successfully and broadcast event', async () => {
      (ParticipantRepository.atomicLeave as any).mockResolvedValue(true);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/rooms/11111111-1111-1111-1111-111111111111/leave',
        headers: { authorization: `Bearer ${guestToken}` }
      });

      expect(response.statusCode).toBe(200);
      expect(RealtimeService.broadcastToRoom).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', 'participant:left', { userId: guestId });
      expect(RealtimeService.removeUserFromRoom).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', guestId);
    });

    it('should not broadcast if user was not a participant', async () => {
      (ParticipantRepository.atomicLeave as any).mockResolvedValue(false);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/rooms/11111111-1111-1111-1111-111111111111/leave',
        headers: { authorization: `Bearer ${guestToken}` }
      });

      expect(response.statusCode).toBe(200); // idempotent success
      expect(RealtimeService.broadcastToRoom).not.toHaveBeenCalled();
      expect(RealtimeService.removeUserFromRoom).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/rooms/:roomId/participants', () => {
    it('should return active participants with online status', async () => {
      const mockRoom = { id: '11111111-1111-1111-1111-111111111111', status: 'ACTIVE', isPrivate: false, hostId };
      (RoomRepository.findById as any).mockResolvedValue(mockRoom);

      // Simulate guest is an active participant
      (ParticipantRepository.getPrisma as any).mockReturnValue({
        participant: {
          findUnique: vi.fn().mockResolvedValue({ leftAt: null })
        }
      });

      const mockParticipants = [
        { userId: guestId, joinedAt: new Date(), user: { displayName: 'Guest', avatarUrl: null } },
        { userId: hostId, joinedAt: new Date(), user: { displayName: 'Host', avatarUrl: null } }
      ];
      (ParticipantRepository.findActiveParticipants as any).mockResolvedValue(mockParticipants);
      
      // Simulate guest has 1 socket, host has 0 sockets
      (RealtimeService.getActiveSocketCount as any).mockImplementation(async (roomId, userId) => {
        return userId === guestId ? 1 : 0;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/rooms/11111111-1111-1111-1111-111111111111/participants',
        headers: { authorization: `Bearer ${guestToken}` } // requesting as guest
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.participants).toHaveLength(2);
      expect(body.data.participants[0].online).toBe(true);
      expect(body.data.participants[1].online).toBe(false);
    });
  });
});
