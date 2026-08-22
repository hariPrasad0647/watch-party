import { AppError } from '../../common/errors/index.js';
import { RoomRepository } from '../rooms/room.repository.js';
import { ParticipantService } from '../participants/participant.service.js';
import { MediaRepository } from './media.repository.js';
import { MediaUpdatePayload, MediaResponse } from './media.schema.js';
import { redis } from '../../infrastructure/redis/index.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { logger } from '../../infrastructure/logger/index.js';

export class MediaService {
  private static async verifyHost(roomId: string, userId: string): Promise<void> {
    const room = await RoomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    if (room.status !== 'ACTIVE') {
      throw new AppError('Room is not active', 400, 'ROOM_NOT_ACTIVE');
    }
    const isMember = await ParticipantService.isParticipant(roomId, userId);
    if (!isMember) {
      throw new AppError('You are not a participant of this room', 403, 'AUTHORIZATION_ERROR');
    }
    if (room.hostId !== userId) {
      throw new AppError('Only the host can control media', 403, 'AUTHORIZATION_ERROR');
    }
  }

  private static async verifyParticipant(roomId: string, userId: string): Promise<void> {
    const room = await RoomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    const isMember = await ParticipantService.isParticipant(roomId, userId);
    if (!isMember && room.hostId !== userId) {
      throw new AppError('You are not a participant of this room', 403, 'AUTHORIZATION_ERROR');
    }
  }

  static async getMedia(roomId: string, userId: string): Promise<MediaResponse | null> {
    await this.verifyParticipant(roomId, userId);
    const media = await MediaRepository.getMediaByRoomId(roomId);
    if (!media) return null;
    return {
      id: media.id,
      provider: media.provider,
      source: media.source,
      title: media.title,
      updatedAt: media.updatedAt
    };
  }

  static async updateMedia(roomId: string, userId: string, payload: MediaUpdatePayload): Promise<MediaResponse> {
    await this.verifyHost(roomId, userId);

    // 1. Check if the media is exactly the same to act idempotently
    const currentMedia = await MediaRepository.getMediaByRoomId(roomId);
    if (currentMedia && currentMedia.provider === payload.provider && currentMedia.source === payload.source) {
      // If only title changed, we still update DB but we don't reset playback
      const updated = await MediaRepository.upsertMedia(roomId, payload);
      const dto = {
        id: updated.id,
        provider: updated.provider,
        source: updated.source,
        title: updated.title,
        updatedAt: updated.updatedAt
      };
      if (currentMedia.title !== payload.title) {
        RealtimeService.broadcastToRoom(roomId, 'media:changed', dto);
      }
      return dto;
    }

    // 2. Authoritative PostgreSQL Upsert
    const updatedMedia = await MediaRepository.upsertMedia(roomId, payload);

    // 3. Transient Redis Playback Reset
    const key = `room:${roomId}:playback`;
    const nowMs = Date.now().toString();
    try {
      await redis.applyPlaybackCommand(key, 'SET_MEDIA', nowMs, updatedMedia.id, roomId, '');
    } catch (err) {
      logger.error({ err, roomId, mediaId: updatedMedia.id }, 'Failed to reset playback state in Redis after media update');
      throw new AppError('Media saved, but failed to sync playback. Please try again.', 500, 'INTERNAL_SERVER_ERROR');
    }

    const dto = {
      id: updatedMedia.id,
      provider: updatedMedia.provider,
      source: updatedMedia.source,
      title: updatedMedia.title,
      updatedAt: updatedMedia.updatedAt
    };

    // 4. Realtime Broadcast
    RealtimeService.broadcastToRoom(roomId, 'media:changed', dto);

    return dto;
  }
}
