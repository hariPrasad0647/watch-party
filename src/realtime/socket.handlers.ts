import { Socket } from 'socket.io';
import { logger } from '../infrastructure/logger/index.js';
import { ParticipantService } from '../modules/participants/participant.service.js';
import { RoomRepository } from '../modules/rooms/room.repository.js';
import { RealtimeService } from './realtime.service.js';
import { registerPlaybackHandlers } from './playback.handlers.js';
import { PlaybackService } from '../modules/playback/playback.service.js';
import { registerChatHandlers } from './chat.handlers.js';

export function registerSocketHandlers(socket: Socket) {
  const userId = socket.data.user?.id;

  socket.on('room:join', async (payload: { roomId?: string }, callback?: (res: any) => void) => {
    try {
      const { roomId } = payload;
      if (!roomId || typeof roomId !== 'string') {
        return callback?.({ error: 'Invalid roomId' });
      }

      // Verify room exists and is active
      const room = await RoomRepository.findById(roomId);
      if (!room || room.status !== 'ACTIVE') {
        return callback?.({ error: 'Room not found or not active' });
      }

      // Verify persistent membership
      const isParticipant = await ParticipantService.isParticipant(roomId, userId);
      if (!isParticipant) {
        return callback?.({ error: 'Not an active participant. Join via HTTP first.' });
      }

      // Get count BEFORE we join
      const prevCount = await RealtimeService.getActiveSocketCount(roomId, userId);

      // Join the socket room
      socket.join(`room:${roomId}`);

      // If this is their first socket, they just came online
      if (prevCount === 0) {
        RealtimeService.broadcastToRoom(roomId, 'participant:online', { userId });
      }

      // Send current playback state to the newly joined socket directly
      try {
        const state = await PlaybackService.getStatus(roomId, userId);
        socket.emit('playback:state', state);
      } catch (err) {
        // If playback state is unavailable (e.g. redis failure), we just don't emit it yet, or emit error
      }

      callback?.({ success: true });
    } catch (err: any) {
      logger.error({ err, userId }, 'Error in room:join handler');
      callback?.({ error: 'Internal server error' });
    }
  });

  registerPlaybackHandlers(socket);
  registerChatHandlers(socket);

  // Handle automatic socket disconnects (network drops, tab close)
  socket.on('disconnecting', async () => {
    // Rooms this socket is currently in (before it's completely disconnected)
    // socket.rooms is a Set containing the socket ID and the rooms it joined
    const rooms = Array.from(socket.rooms);
    
    for (const roomName of rooms) {
      if (roomName.startsWith('room:')) {
        const roomId = roomName.replace('room:', '');
        
        // At this point, the socket is still in the room. 
        // We need to know if it's the LAST socket.
        // Get all sockets for this user in this room right now
        const currentCount = await RealtimeService.getActiveSocketCount(roomId, userId);
        
        // If count is exactly 1, this socket is the last one
        if (currentCount === 1) {
          // It's the last socket, so once it fully disconnects, the user is offline
          // We can just broadcast offline directly since it's disconnecting
          RealtimeService.broadcastToRoom(roomId, 'participant:offline', { userId });
        }
      }
    }
  });
}
