import { prisma } from '../../infrastructure/database/index.js';
import { MediaUpdatePayload } from './media.schema.js';
import { RoomMedia } from '@prisma/client';

export class MediaRepository {
  static async upsertMedia(roomId: string, payload: MediaUpdatePayload): Promise<RoomMedia> {
    return prisma.roomMedia.upsert({
      where: { roomId },
      update: {
        provider: payload.provider,
        source: payload.source,
        title: payload.title
      },
      create: {
        roomId,
        provider: payload.provider,
        source: payload.source,
        title: payload.title
      }
    });
  }

  static async getMediaByRoomId(roomId: string): Promise<RoomMedia | null> {
    return prisma.roomMedia.findUnique({
      where: { roomId }
    });
  }

  static async deleteMediaByRoomId(roomId: string): Promise<void> {
    await prisma.roomMedia.delete({
      where: { roomId }
    });
  }
}
