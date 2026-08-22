import { Participant } from '@prisma/client';
import { ParticipantRepository } from './participant.repository.js';
import { RoomRepository } from '../rooms/room.repository.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { RoomNotFoundError, RoomForbiddenError, AppError } from '../../common/errors/index.js';

export class ParticipantService {
  /**
   * Intentionally join a room via HTTP
   */
  static async joinRoom(roomId: string, userId: string): Promise<Participant> {
    const room = await RoomRepository.findById(roomId);
    
    if (!room) {
      throw new RoomNotFoundError();
    }

    if (room.isPrivate && room.hostId !== userId) {
      // Allow if they have an existing participant record (permanent authorization)
      const existingParticipant = await ParticipantRepository.getPrisma().participant.findUnique({
        where: { roomId_userId: { roomId, userId } }
      });
      
      if (!existingParticipant) {
        throw new AppError('You are not authorized to join this private room. An invitation is required.', 403, 'ROOM_JOIN_FORBIDDEN');
      }
    }

    const result = await ParticipantRepository.atomicJoin(roomId, userId);

    if (!result) {
      throw new AppError('Room has reached maximum capacity', 400, 'ROOM_FULL');
    }

    const { participant, isNew } = result;

    if (isNew) {
      // Broadcast intentional join event
      RealtimeService.broadcastToRoom(roomId, 'participant:joined', {
        userId,
        joinedAt: participant.joinedAt.toISOString()
      });
    }

    return participant;
  }

  /**
   * Intentionally leave a room via HTTP
   */
  static async leaveRoom(roomId: string, userId: string): Promise<void> {
    // Determine if they were an active participant
    const leftSuccessfully = await ParticipantRepository.atomicLeave(roomId, userId);

    if (leftSuccessfully) {
      // Broadcast intentional leave event
      RealtimeService.broadcastToRoom(roomId, 'participant:left', { userId });
      // Remove all sockets for this user from the room to clear realtime presence
      // Wait, we don't have a way to selectively disconnect just ONE user's sockets from the room without disconnecting them from the server.
      // We can iterate over their sockets and call socket.leave(`room:${roomId}`).
      // To do this, we need a method in RealtimeService.
      await RealtimeService.removeUserFromRoom(roomId, userId);
    }
  }

  /**
   * Used by Socket.IO to verify if a socket is allowed to join the realtime room
   */
  static async isParticipant(roomId: string, userId: string): Promise<boolean> {
    const participant = await ParticipantRepository.getPrisma().participant.findUnique({
      where: { roomId_userId: { roomId, userId } }
    });
    return !!participant && participant.leftAt === null;
  }

  /**
   * Used by HTTP to get the active participant list
   */
  static async getActiveParticipants(roomId: string, userId: string) {
    const room = await RoomRepository.findById(roomId);
    if (!room) {
      throw new RoomNotFoundError();
    }

    // Only host or active participants can view the list
    const isHost = room.hostId === userId;
    const isMember = await this.isParticipant(roomId, userId);

    if (room.isPrivate && !isHost && !isMember) {
      throw new AppError('You are not authorized to view this room', 403, 'ROOM_JOIN_FORBIDDEN');
    }
    
    // For public rooms, anyone could theoretically join, but let's restrict participant enumeration to members/host to prevent scraping
    if (!room.isPrivate && !isHost && !isMember) {
       throw new RoomForbiddenError('Only active participants can view the participant list');
    }

    const participants = await ParticipantRepository.findActiveParticipants(roomId);

    // Map DB profiles with realtime status
    const result = [];
    for (const p of participants) {
      const activeSockets = await RealtimeService.getActiveSocketCount(roomId, p.userId);
      result.push({
        userId: p.userId,
        displayName: p.user.displayName,
        avatarUrl: p.user.avatarUrl,
        joinedAt: p.joinedAt,
        online: activeSockets > 0
      });
    }

    return result;
  }
}
