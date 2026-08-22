import { AppError } from '../../common/errors/index.js';
import { RoomRepository } from '../rooms/room.repository.js';
import { ParticipantService } from '../participants/participant.service.js';
import { ChatRepository, formatChatMessage } from './chat.repository.js';
import { sendChatMessageSchema } from './chat.schema.js';
import { RateLimiter } from '../../infrastructure/redis/rate-limiter.js';
import { KeysetPaginationParams } from '../../common/utils/cursor-pagination.js';
import { Prisma } from '@prisma/client';

export class ChatService {
  /**
   * Processes an incoming chat message from a socket.
   */
  static async sendMessage(userId: string, roomId: string, payload: any) {
    // 1. Validate payload
    const parsed = sendChatMessageSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AppError('Invalid message payload', 400, 'VALIDATION_ERROR');
    }
    const { content, clientMessageId } = parsed.data;

    // 2. Authorize Room
    const room = await RoomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'NOT_FOUND');
    }
    if (room.status !== 'ACTIVE') {
      throw new AppError('Cannot send messages to an ended room', 403, 'FORBIDDEN');
    }

    // 3. Authorize Participant
    const isParticipant = await ParticipantService.isParticipant(roomId, userId);
    if (!isParticipant) {
      throw new AppError('Must be an active participant to send messages', 403, 'FORBIDDEN');
    }

    // 4. Rate Limiting (5 messages per 3 seconds per user in a room)
    const rateLimitKey = `ratelimit:chat:${roomId}:${userId}`;
    const allowed = await RateLimiter.checkLimit(rateLimitKey, 5, 3);
    if (!allowed) {
      throw new AppError('Rate limit exceeded for chat messages', 429, 'RATE_LIMIT_EXCEEDED');
    }

    // 5. Persist with Idempotency
    try {
      const message = await ChatRepository.createMessage({
        roomId,
        senderId: userId,
        content,
        clientMessageId
      });
      return formatChatMessage(message);
    } catch (err: any) {
      // Check for unique constraint violation on [senderId, clientMessageId]
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        if (clientMessageId) {
          const existing = await ChatRepository.findMessageByClientMessageId(userId, clientMessageId);
          if (existing) {
            return formatChatMessage(existing);
          }
        }
      }
      throw err;
    }
  }

  /**
   * Retrieves chat history for a room.
   */
  static async getMessages(userId: string, roomId: string, params: KeysetPaginationParams) {
    // 1. Authorize: Must be an active participant to read history in V1
    const isParticipant = await ParticipantService.isParticipant(roomId, userId);
    if (!isParticipant) {
      throw new AppError('Must be an active participant to read chat history', 403, 'FORBIDDEN');
    }

    const result = await ChatRepository.findMessages(roomId, params);

    return {
      items: result.items.map(formatChatMessage),
      pagination: result.pagination
    };
  }
}
