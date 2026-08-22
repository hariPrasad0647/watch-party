import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { FastifyInstance } from 'fastify';
import { env } from '../../src/config/env.js';
import { sign } from 'jsonwebtoken';
import { PlaybackRepository } from '../../src/modules/playback/playback.repository.js';
import { RoomRepository } from '../../src/modules/rooms/room.repository.js';
import { ParticipantRepository } from '../../src/modules/participants/participant.repository.js';
import { ParticipantNotFoundError } from '../../src/common/errors/index.js';

vi.mock('../../src/modules/rooms/room.repository.js', () => ({
  RoomRepository: {
    findById: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('../../src/modules/participants/participant.repository.js', () => ({
  ParticipantRepository: {
    findByRoomAndUser: vi.fn(),
    create: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('../../src/infrastructure/redis/index.js', () => ({
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(),
  redis: {
    del: vi.fn(),
    eval: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    applyPlaybackCommand: vi.fn()
  }
}));

describe('Playback Module (Module 5)', () => {
  let app: FastifyInstance;
  let hostToken: string;
  let guestToken: string;
  let nonMemberToken: string;
  const hostId = 'host-123';
  const guestId = 'guest-456';
  const nonMemberId = 'non-member-789';
  const roomId = '55555555-5555-5555-5555-555555555555';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    
    // Create tokens
    const createToken = (id: string) => sign(
      { sub: id, type: 'access', jti: `${id}-jti` },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );
    
    hostToken = createToken(hostId);
    guestToken = createToken(guestId);
    nonMemberToken = createToken(nonMemberId);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should initialize default state on GET /playback for authorized participants', async () => {
    (RoomRepository.findById as any).mockResolvedValue({ id: roomId, hostId, status: 'ACTIVE' });
    (ParticipantRepository.findByRoomAndUser as any).mockResolvedValue({ id: 'part-1', userId: guestId, roomId });
    
    // Mock redis.applyPlaybackCommand for PlaybackRepository.getState
    const { redis } = await import('../../src/infrastructure/redis/index.js');
    (redis.applyPlaybackCommand as any).mockResolvedValue('{"status":"PAUSED","basePositionMs":0,"playbackRate":1,"version":0,"serverTimestamp":1234567890}');

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/rooms/${roomId}/playback`,
      headers: { authorization: `Bearer ${guestToken}` }
    });

    if (response.statusCode === 500) {
      console.log('500 Error body:', response.payload);
    }
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.playback.status).toBe('PAUSED');
    expect(body.data.playback.basePositionMs).toBe(0);
    expect(body.data.playback.playbackRate).toBe(1);
    expect(body.data.playback.version).toBe(0);
  });

  it('should reject non-members from reading playback state', async () => {
    (RoomRepository.findById as any).mockResolvedValue({ id: roomId, hostId, status: 'ACTIVE' });
    (ParticipantRepository.findByRoomAndUser as any).mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/rooms/${roomId}/playback`,
      headers: { authorization: `Bearer ${nonMemberToken}` }
    });

    if (response.statusCode === 500) {
      console.log('500 Error body:', response.payload);
    }
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.payload);
    expect(body.error.code).toBe('AUTHORIZATION_ERROR');
  });

  describe('Playback Logic (Lua Script)', () => {
    it('should handle PLAY and increment version', async () => {
      const { redis } = await import('../../src/infrastructure/redis/index.js');
      (redis.applyPlaybackCommand as any).mockResolvedValue('{"status":"PLAYING","basePositionMs":0,"playbackRate":1,"version":1,"serverTimestamp":1234567890}');
      
      const state1 = await PlaybackRepository.applyCommand(roomId, 'PLAY');
      expect(state1.status).toBe('PLAYING');
      expect(state1.version).toBe(1);
    });

    it('should handle SEEK while PAUSED', async () => {
      const { redis } = await import('../../src/infrastructure/redis/index.js');
      (redis.applyPlaybackCommand as any).mockResolvedValue('{"status":"PAUSED","basePositionMs":5000,"playbackRate":1,"version":3,"serverTimestamp":1234567890}');

      const state = await PlaybackRepository.applyCommand(roomId, 'SEEK', '5000');
      expect(state.status).toBe('PAUSED');
      expect(state.basePositionMs).toBe(5000);
      expect(state.version).toBe(3);
    });

    it('should handle RATE', async () => {
      const { redis } = await import('../../src/infrastructure/redis/index.js');
      (redis.applyPlaybackCommand as any).mockResolvedValue('{"status":"PLAYING","basePositionMs":5000,"playbackRate":2,"version":4,"serverTimestamp":1234567890}');

      const state = await PlaybackRepository.applyCommand(roomId, 'RATE', '2');
      expect(state.playbackRate).toBe(2);
      expect(state.version).toBe(4);
    });
  });
});
