import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { buildApp } from '../../src/app.js';
import { FastifyInstance } from 'fastify';
import { RoomRepository } from '../../src/modules/rooms/room.repository.js';
import { TokenService } from '../../src/modules/auth/token.service.js';
import { ROOM_CONSTANTS } from '../../src/config/constants.js';
import { connectRedis, disconnectRedis } from '../../src/infrastructure/redis/index.js';

// Mock RoomRepository
vi.mock('../../src/modules/rooms/room.repository.js', () => ({
  RoomRepository: {
    createRoom: vi.fn(),
    findById: vi.fn(),
    findRoomsByHostId: vi.fn(),
    updateRoom: vi.fn(),
    endRoomAtomic: vi.fn()
  }
}));

// Mock PlaybackRepository
vi.mock('../../src/modules/playback/playback.repository.js', () => ({
  PlaybackRepository: {
    deleteState: vi.fn().mockResolvedValue(undefined)
  }
}));

describe('Rooms Module (Module 3)', () => {
  let app: FastifyInstance;
  let validToken: string;
  const hostId = 'host-123';
  const guestId = 'guest-456';
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

  describe('POST /api/v1/rooms', () => {
    it('should create a room with valid payload', async () => {
      const mockRoom = {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'My Cool Room',
        hostId,
        status: 'ACTIVE',
        maxParticipants: ROOM_CONSTANTS.MAX_PARTICIPANTS_DEFAULT,
        isPrivate: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        endedAt: null
      };

      (RoomRepository.createRoom as any).mockResolvedValue(mockRoom);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/rooms',
        headers: { authorization: `Bearer ${validToken}` },
        payload: { name: 'My Cool Room' }
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.room.name).toBe('My Cool Room');
      expect(body.data.room.hostId).toBe(hostId);
      expect(RoomRepository.createRoom).toHaveBeenCalledWith(expect.objectContaining({
        name: 'My Cool Room',
        hostId
      }));
    });

    it('should fail with invalid maxParticipants', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/rooms',
        headers: { authorization: `Bearer ${validToken}` },
        payload: {
          name: 'Invalid Room',
          maxParticipants: 1000
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/rooms/:roomId', () => {
    it('should return a public room for any authenticated user', async () => {
      const mockRoom = { id: '22222222-2222-2222-2222-222222222222', name: 'Public Room', hostId, isPrivate: false };
      (RoomRepository.findById as any).mockResolvedValue(mockRoom);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/rooms/22222222-2222-2222-2222-222222222222',
        headers: { authorization: `Bearer ${guestToken}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.room.id).toBe('22222222-2222-2222-2222-222222222222');
    });

    it('should return 404 for a private room if requester is not the host', async () => {
      const mockRoom = { id: '33333333-3333-3333-3333-333333333333', name: 'Private Room', hostId, isPrivate: true };
      (RoomRepository.findById as any).mockResolvedValue(mockRoom);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/rooms/33333333-3333-3333-3333-333333333333',
        headers: { authorization: `Bearer ${guestToken}` }
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('ROOM_NOT_FOUND');
    });
  });

  describe('GET /api/v1/rooms (Listing)', () => {
    it('should return paginated rooms for the host', async () => {
      const mockRooms = [{ id: 'room-4', hostId }, { id: 'room-5', hostId }];
      (RoomRepository.findRoomsByHostId as any).mockResolvedValue({ rooms: [mockRooms[0]], total: 2 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/rooms?page=1&limit=1',
        headers: { authorization: `Bearer ${validToken}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.data).toHaveLength(1);
      expect(body.data.meta.total).toBe(2);
      expect(body.data.meta.totalPages).toBe(2);
    });
  });

  describe('PATCH /api/v1/rooms/:roomId', () => {
    it('should update room fields if requested by host', async () => {
      const mockRoom = { id: '66666666-6666-6666-6666-666666666666', name: 'Old Name', hostId, status: 'ACTIVE' };
      (RoomRepository.findById as any).mockResolvedValue(mockRoom);
      (RoomRepository.updateRoom as any).mockResolvedValue({ ...mockRoom, name: 'New Name' });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/rooms/66666666-6666-6666-6666-666666666666',
        headers: { authorization: `Bearer ${validToken}` },
        payload: { name: 'New Name' }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.room.name).toBe('New Name');
    });

    it('should reject update if requested by non-host (403)', async () => {
      const mockRoom = { id: '77777777-7777-7777-7777-777777777777', name: 'Target Room', hostId, status: 'ACTIVE' };
      (RoomRepository.findById as any).mockResolvedValue(mockRoom);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/rooms/77777777-7777-7777-7777-777777777777',
        headers: { authorization: `Bearer ${guestToken}` },
        payload: { name: 'Hacked Name' }
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('ROOM_FORBIDDEN');
    });
  });

  describe('POST /api/v1/rooms/:roomId/end', () => {
    it('should end the room atomically and set endedAt', async () => {
      const mockRoom = { id: '88888888-8888-8888-8888-888888888888', hostId, status: 'ACTIVE' };
      (RoomRepository.findById as any).mockResolvedValue(mockRoom);
      (RoomRepository.endRoomAtomic as any).mockResolvedValue({ ...mockRoom, status: 'ENDED', endedAt: new Date() });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/rooms/88888888-8888-8888-8888-888888888888/end',
        headers: { authorization: `Bearer ${validToken}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.room.status).toBe('ENDED');
      expect(body.data.room.endedAt).toBeDefined();
    });

    it('should return 400 ROOM_ALREADY_ENDED if already ended', async () => {
      const mockRoom = { id: '99999999-9999-9999-9999-999999999999', hostId, status: 'ACTIVE' }; // Initially say it's active so we hit atomic transition
      (RoomRepository.findById as any).mockResolvedValueOnce(mockRoom).mockResolvedValueOnce({ ...mockRoom, status: 'ENDED' });
      
      const p2025Error = new Error('Record to update not found');
      (p2025Error as any).code = 'P2025';
      (RoomRepository.endRoomAtomic as any).mockRejectedValue(p2025Error);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/rooms/99999999-9999-9999-9999-999999999999/end',
        headers: { authorization: `Bearer ${validToken}` }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('ROOM_ALREADY_ENDED');
    });
  });
});
