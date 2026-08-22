import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { FastifyInstance } from 'fastify';
import { env } from '../../src/config/env.js';
import { sign } from 'jsonwebtoken';
import { RoomRepository } from '../../src/modules/rooms/room.repository.js';
import { ParticipantService } from '../../src/modules/participants/participant.service.js';
import { MediaRepository } from '../../src/modules/media/media.repository.js';
import { redis } from '../../src/infrastructure/redis/index.js';
import { RealtimeService } from '../../src/realtime/realtime.service.js';

vi.mock('../../src/modules/rooms/room.repository.js', () => ({
  RoomRepository: {
    findById: vi.fn(),
  }
}));

vi.mock('../../src/modules/participants/participant.service.js', () => ({
  ParticipantService: {
    isParticipant: vi.fn()
  }
}));

vi.mock('../../src/modules/media/media.repository.js', () => ({
  MediaRepository: {
    upsertMedia: vi.fn(),
    getMediaByRoomId: vi.fn()
  }
}));

vi.mock('../../src/infrastructure/redis/index.js', () => ({
  redis: {
    applyPlaybackCommand: vi.fn()
  }
}));

vi.mock('../../src/realtime/realtime.service.js', () => ({
  RealtimeService: {
    broadcastToRoom: vi.fn(),
    initialize: vi.fn()
  }
}));

describe('Module 9: Media & Content API', () => {
  let app: FastifyInstance;
  let hostToken: string;
  let guestToken: string;
  let strangerToken: string;
  const hostId = 'host-123';
  const guestId = 'guest-456';
  const strangerId = 'stranger-789';
  const roomId = '55555555-5555-5555-5555-555555555555';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    
    const createToken = (id: string) => sign(
      { sub: id, type: 'access', jti: `${id}-jti` },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );
    
    hostToken = createToken(hostId);
    guestToken = createToken(guestId);
    strangerToken = createToken(strangerId);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('PUT /api/v1/rooms/:roomId/media', () => {
    it('should reject non-hosts', async () => {
      (RoomRepository.findById as any).mockResolvedValue({ id: roomId, hostId, status: 'ACTIVE' });
      (ParticipantService.isParticipant as any).mockResolvedValue(true);

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/rooms/${roomId}/media`,
        headers: { authorization: `Bearer ${guestToken}` },
        payload: {
          provider: 'YOUTUBE',
          source: 'dQw4w9WgXcQ'
        }
      });

      expect(response.statusCode).toBe(403);
    });

    it('should reject invalid DIRECT URL scheme', async () => {
      (RoomRepository.findById as any).mockResolvedValue({ id: roomId, hostId, status: 'ACTIVE' });
      (ParticipantService.isParticipant as any).mockResolvedValue(true);

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/rooms/${roomId}/media`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: {
          provider: 'DIRECT',
          source: 'http://example.com/video.mp4' // HTTP instead of HTTPS
        }
      });

      expect(response.statusCode).toBe(400); // Validation error
    });

    it('should reject javascript URL scheme', async () => {
      (RoomRepository.findById as any).mockResolvedValue({ id: roomId, hostId, status: 'ACTIVE' });
      (ParticipantService.isParticipant as any).mockResolvedValue(true);

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/rooms/${roomId}/media`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: {
          provider: 'DIRECT',
          source: 'javascript:alert(1)'
        }
      });

      expect(response.statusCode).toBe(400); // Validation error
    });

    it('should allow host to update media safely and broadcast', async () => {
      (RoomRepository.findById as any).mockResolvedValue({ id: roomId, hostId, status: 'ACTIVE' });
      (ParticipantService.isParticipant as any).mockResolvedValue(true);
      (MediaRepository.getMediaByRoomId as any).mockResolvedValue(null); // No previous media
      
      const mockMedia = {
        id: 'media-1',
        provider: 'DIRECT',
        source: 'https://example.com/video.mp4',
        title: 'Video',
        updatedAt: new Date()
      };
      (MediaRepository.upsertMedia as any).mockResolvedValue(mockMedia);
      (redis.applyPlaybackCommand as any).mockResolvedValue('{}');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/rooms/${roomId}/media`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: {
          provider: 'DIRECT',
          source: 'https://example.com/video.mp4',
          title: 'Video'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(MediaRepository.upsertMedia).toHaveBeenCalled();
      expect(redis.applyPlaybackCommand).toHaveBeenCalledWith(
        `room:${roomId}:playback`,
        'SET_MEDIA',
        expect.any(String),
        'media-1',
        roomId,
        ''
      );
      expect(RealtimeService.broadcastToRoom).toHaveBeenCalledWith(roomId, 'media:changed', expect.objectContaining({
        id: 'media-1'
      }));
    });
  });

  describe('GET /api/v1/rooms/:roomId/media', () => {
    it('should allow participants to get media', async () => {
      (RoomRepository.findById as any).mockResolvedValue({ id: roomId, hostId, status: 'ACTIVE' });
      (ParticipantService.isParticipant as any).mockResolvedValue(true);
      
      const mockMedia = {
        id: 'media-1',
        provider: 'YOUTUBE',
        source: 'dQw4w9WgXcQ',
        title: 'Rick Astley',
        updatedAt: new Date()
      };
      (MediaRepository.getMediaByRoomId as any).mockResolvedValue(mockMedia);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/rooms/${roomId}/media`,
        headers: { authorization: `Bearer ${guestToken}` }
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.data.media.provider).toBe('YOUTUBE');
      expect(payload.data.media.source).toBe('dQw4w9WgXcQ');
    });

    it('should reject strangers', async () => {
      (RoomRepository.findById as any).mockResolvedValue({ id: roomId, hostId, status: 'ACTIVE' });
      (ParticipantService.isParticipant as any).mockResolvedValue(false);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/rooms/${roomId}/media`,
        headers: { authorization: `Bearer ${strangerToken}` }
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
