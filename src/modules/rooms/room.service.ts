import { Room } from '@prisma/client';
import { RoomRepository } from './room.repository.js';
import { ROOM_CONSTANTS } from '../../config/constants.js';
import { buildPaginatedResult, PaginationParams } from '../../common/utils/pagination.js';
import {
  RoomNotFoundError,
  RoomForbiddenError,
  RoomAlreadyEndedError,
  RoomInvalidStateError
} from '../../common/errors/index.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { PlaybackRepository } from '../playback/playback.repository.js';

export class RoomService {
  /**
   * Create a new room
   */
  static async createRoom(
    hostId: string,
    data: { name: string; isPrivate?: boolean; maxParticipants?: number }
  ): Promise<Room> {
    const isPrivate = data.isPrivate ?? false;
    const maxParticipants = data.maxParticipants ?? ROOM_CONSTANTS.MAX_PARTICIPANTS_DEFAULT;

    return RoomRepository.createRoom({
      name: data.name,
      hostId,
      isPrivate,
      maxParticipants,
      status: 'ACTIVE'
    });
  }

  /**
   * Get a room by ID
   * Retrieves the room metadata. This does NOT join the room.
   */
  static async getRoom(userId: string, roomId: string): Promise<Room> {
    const room = await RoomRepository.findById(roomId);

    if (!room) {
      throw new RoomNotFoundError();
    }

    // If the room is private, and the user is not the host, pretend it doesn't exist to prevent enumeration.
    // In the future, this will check if the user is an invited participant.
    if (room.isPrivate && room.hostId !== userId) {
      throw new RoomNotFoundError();
    }

    return room;
  }

  /**
   * List the authenticated user's rooms (where they are the host)
   */
  static async listMyRooms(userId: string, pagination: PaginationParams) {
    const { rooms, total } = await RoomRepository.findRoomsByHostId(
      userId,
      pagination.page,
      pagination.limit
    );
    return buildPaginatedResult(rooms, total, pagination);
  }

  /**
   * Update room settings
   */
  static async updateRoom(
    userId: string,
    roomId: string,
    data: { name?: string; isPrivate?: boolean; maxParticipants?: number }
  ): Promise<Room> {
    const room = await RoomRepository.findById(roomId);

    if (!room) {
      throw new RoomNotFoundError();
    }

    if (room.hostId !== userId) {
      throw new RoomForbiddenError();
    }

    if (room.status === 'ENDED') {
      throw new RoomInvalidStateError('Cannot update an ended room');
    }

    if (Object.keys(data).length === 0) {
      // Nothing to update
      return room;
    }

    return RoomRepository.updateRoom(roomId, data);
  }

  /**
   * End a room (ACTIVE -> ENDED)
   */
  static async endRoom(userId: string, roomId: string): Promise<Room> {
    const room = await RoomRepository.findById(roomId);

    if (!room) {
      throw new RoomNotFoundError();
    }

    if (room.hostId !== userId) {
      throw new RoomForbiddenError();
    }

    try {
      // Attempt the atomic transition
      const endedRoom = await RoomRepository.endRoomAtomic(roomId);
      
      // 1. Delete playback state from Redis
      await PlaybackRepository.deleteState(roomId).catch(_err => {
        // Ignore deletion errors, the room status is ENDED so it's safely blocked anyway
      });

      // 2. Broadcast room:ended via RealtimeService
      RealtimeService.broadcastToRoom(roomId, 'room:ended', { roomId });
      
      // 3. Force disconnect all sockets in that room
      await RealtimeService.disconnectAllFromRoom(roomId);
      
      return endedRoom;
    } catch (_err: any) {
      // Prisma P2025: Record to update not found
      if (_err.code === 'P2025') {
        // Since we already verified it exists above, it must have already been ended concurrently
        // Let's double check to be safe
        const currentRoom = await RoomRepository.findById(roomId);
        if (!currentRoom) {
          throw new RoomNotFoundError();
        }
        if (currentRoom.status === 'ENDED') {
          throw new RoomAlreadyEndedError();
        }
      }
      throw _err;
    }
  }
}
