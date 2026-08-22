import { AppError } from '../../common/errors/index.js';
import { RoomRepository } from '../rooms/room.repository.js';
import { ParticipantRepository } from '../participants/participant.repository.js';
import { PlaybackRepository } from './playback.repository.js';
import { PlaybackState } from './playback.schema.js';

export class PlaybackService {
  private static async verifyHost(roomId: string, userId: string): Promise<void> {
    const room = await RoomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    if (room.status !== 'ACTIVE') {
      throw new AppError('Room is not active', 400, 'ROOM_NOT_ACTIVE');
    }
    const isMember = await ParticipantRepository.findByRoomAndUser(roomId, userId);
    if (!isMember) {
      throw new AppError('You are not a participant of this room', 403, 'AUTHORIZATION_ERROR');
    }
    if (room.hostId !== userId) {
      throw new AppError('Only the host can control playback', 403, 'AUTHORIZATION_ERROR');
    }
  }

  private static async verifyParticipant(roomId: string, userId: string): Promise<void> {
    const room = await RoomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    if (room.status !== 'ACTIVE') {
      throw new AppError('Room is not active', 400, 'ROOM_NOT_ACTIVE');
    }
    const isMember = await ParticipantRepository.findByRoomAndUser(roomId, userId);
    if (!isMember && room.hostId !== userId) {
      throw new AppError('You are not a participant of this room', 403, 'AUTHORIZATION_ERROR');
    }
  }

  static async getStatus(roomId: string, userId: string): Promise<PlaybackState> {
    await this.verifyParticipant(roomId, userId);
    try {
      return await PlaybackRepository.getStatus(roomId);
    } catch (err) {
      throw new AppError('Playback synchronization is temporarily unavailable.', 503, 'PLAYBACK_STATE_UNAVAILABLE');
    }
  }

  static async executeCommand(
    roomId: string,
    userId: string,
    command: 'PLAY' | 'PAUSE' | 'SEEK' | 'RATE',
    payload?: number
  ): Promise<PlaybackState> {
    await this.verifyHost(roomId, userId);
    try {
      return await PlaybackRepository.applyCommand(roomId, command, payload?.toString());
    } catch (err) {
      throw new AppError('Playback synchronization is temporarily unavailable.', 503, 'PLAYBACK_STATE_UNAVAILABLE');
    }
  }
}
