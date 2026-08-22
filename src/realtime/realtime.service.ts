import { io } from '../infrastructure/websocket/index.js';

export class RealtimeService {
  /**
   * Broadcasts an event to a specific room.
   */
  static broadcastToRoom(roomId: string, event: string, payload: any) {
    if (!io) return;
    io.to(`room:${roomId}`).emit(event, payload);
  }

  /**
   * Disconnect all sockets currently in a specific room.
   * Used when a room ends.
   */
  static async disconnectAllFromRoom(roomId: string) {
    if (!io) return;
    io.in(`room:${roomId}`).disconnectSockets(true);
  }

  /**
   * Get the number of active sockets a user has in a given room.
   */
  static async getActiveSocketCount(roomId: string, userId: string): Promise<number> {
    if (!io) return 0;
    
    // fetchSockets works across all nodes via the redis-adapter
    const sockets = await io.in(`room:${roomId}`).fetchSockets();
    
    let count = 0;
    for (const socket of sockets) {
      if (socket.data.user?.id === userId) {
        count++;
      }
    }
    
    return count;
  }

  /**
   * Remove all of a specific user's sockets from a room.
   */
  static async removeUserFromRoom(roomId: string, userId: string) {
    if (!io) return;
    
    const sockets = await io.in(`room:${roomId}`).fetchSockets();
    
    for (const socket of sockets) {
      if (socket.data.user?.id === userId) {
        socket.leave(`room:${roomId}`);
        // Optionally, we could also broadcast that their sockets have been removed internally,
        // but the HTTP layer handles broadcasting 'participant:left'.
        // Wait, socket.leave does not emit 'disconnecting', but they leave the room.
        // We might want to trigger the offline event? No, they explicitly left via HTTP.
      }
    }
  }
}
