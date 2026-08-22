import { prisma } from '../../infrastructure/database/index.js';
import { KeysetPaginationParams, getKeysetPaginationOptions, buildKeysetPaginatedResult } from '../../common/utils/cursor-pagination.js';
import { ChatMessagePayload } from './chat.types.js';

export class ChatRepository {
  static async createMessage(data: {
    roomId: string;
    senderId: string;
    content: string;
    clientMessageId?: string;
  }) {
    return prisma.chatMessage.create({
      data,
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        }
      }
    });
  }

  static async findMessages(roomId: string, params: KeysetPaginationParams) {
    const paginationOptions = getKeysetPaginationOptions(params);

    const messages = await prisma.chatMessage.findMany({
      where: {
        roomId,
        ...paginationOptions.where
      },
      take: paginationOptions.take,
      orderBy: paginationOptions.orderBy,
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        }
      }
    });

    const isAfter = !!params.after;
    const limit = Math.max(1, Math.min(100, params.limit || 50));

    return buildKeysetPaginatedResult(
      messages,
      limit,
      isAfter,
      (msg) => ({ createdAt: msg.createdAt, id: msg.id })
    );
  }

  static async findMessageByClientMessageId(senderId: string, clientMessageId: string) {
    return prisma.chatMessage.findUnique({
      where: {
        senderId_clientMessageId: {
          senderId,
          clientMessageId
        }
      },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        }
      }
    });
  }
}

export function formatChatMessage(message: any): ChatMessagePayload {
  return {
    id: message.id,
    roomId: message.roomId,
    sender: {
      id: message.sender.id,
      displayName: message.sender.displayName,
      avatarUrl: message.sender.avatarUrl
    },
    content: message.content,
    createdAt: message.createdAt.toISOString()
  };
}
