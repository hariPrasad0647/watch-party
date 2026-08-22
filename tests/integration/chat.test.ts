import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { FastifyInstance } from 'fastify';
import { env } from '../../src/config/env.js';
import { sign } from 'jsonwebtoken';
import { ChatRepository } from '../../src/modules/chat/chat.repository.js';
import { RoomRepository } from '../../src/modules/rooms/room.repository.js';
import { ParticipantService } from '../../src/modules/participants/participant.service.js';

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

vi.mock('../../src/modules/chat/chat.repository.js', async () => {
  const actual: any = await vi.importActual('../../src/modules/chat/chat.repository.js');
  return {
    ...actual,
    ChatRepository: {
      findMessages: vi.fn(),
      createMessage: vi.fn()
    }
  };
});

describe('Chat API Integration', () => {
  let app: FastifyInstance;
  let user1Token: string;
  let user2Token: string;
  const user1Id = 'user-1';
  const user2Id = 'user-2';
  const roomId = '55555555-5555-5555-5555-555555555555';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const createToken = (id: string) => sign(
      { sub: id, type: 'access', jti: `${id}-jti` },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );
    user1Token = createToken(user1Id);
    user2Token = createToken(user2Id);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/rooms/:roomId/messages', () => {
    it('should reject unauthenticated requests', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/rooms/${roomId}/messages`
      });
      expect(response.statusCode).toBe(401);
    });

    it('should reject if user is not a participant', async () => {
      (RoomRepository.findById as any).mockResolvedValue({ id: roomId, status: 'ACTIVE' });
      (ParticipantService.isParticipant as any).mockResolvedValue(false);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/rooms/${roomId}/messages`,
        headers: {
          authorization: `Bearer ${user2Token}`
        }
      });
      expect(response.statusCode).toBe(403);
    });

    it('should retrieve messages in oldest->newest order', async () => {
      (RoomRepository.findById as any).mockResolvedValue({ id: roomId, status: 'ACTIVE' });
      (ParticipantService.isParticipant as any).mockResolvedValue(true);
      (ChatRepository.findMessages as any).mockResolvedValue({
        items: [
          { id: '1', roomId, content: 'Message 1', createdAt: new Date(), sender: { id: 'user-1', displayName: 'User 1', avatarUrl: null } },
          { id: '2', roomId, content: 'Message 2', createdAt: new Date(), sender: { id: 'user-1', displayName: 'User 1', avatarUrl: null } }
        ],
        pagination: { hasMoreBefore: false, hasMoreAfter: false, nextBefore: null, nextAfter: null }
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/rooms/${roomId}/messages`,
        headers: {
          authorization: `Bearer ${user1Token}`
        }
      });
      if (response.statusCode === 500) {
        console.log('500 Error body:', response.payload);
      }
      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.items).toHaveLength(2);
      expect(data.items[0].content).toBe('Message 1');
      expect(data.items[1].content).toBe('Message 2');
    });
  });
});
