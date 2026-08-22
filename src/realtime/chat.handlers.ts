import { Socket } from 'socket.io';
import { ChatService } from '../modules/chat/chat.service.js';
import { logger } from '../infrastructure/logger/index.js';
import { RealtimeService } from './realtime.service.js';

export function registerChatHandlers(socket: Socket) {
  const userId = socket.data.user?.id;

  socket.on('chat:send', async (payload: any, callback?: (res: any) => void) => {
    try {
      if (!userId) {
        return callback?.({ error: 'Unauthorized' });
      }

      // Payload must contain roomId
      if (!payload || typeof payload.roomId !== 'string') {
        return callback?.({ error: 'Invalid roomId' });
      }

      const { roomId, ...messageData } = payload;
      
      const message = await ChatService.sendMessage(userId, roomId, messageData);
      
      // ACK sender
      callback?.({ success: true, message });
      
      // Broadcast to room (including sender, sender handles deduplication)
      RealtimeService.broadcastToRoom(roomId, 'chat:message', message);
      
    } catch (err: any) {
      if (err.statusCode && err.statusCode < 500) {
        callback?.({ error: err.message, code: err.errorCode });
      } else {
        logger.error({ err, userId, payload }, 'Error sending chat message');
        callback?.({ error: 'Internal server error' });
      }
    }
  });
}
