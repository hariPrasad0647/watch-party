import { Socket } from 'socket.io';
import { redis } from '../infrastructure/redis/index.js';
import { PlaybackService } from '../modules/playback/playback.service.js';
import { SeekCommandSchema, RateCommandSchema } from '../modules/playback/playback.schema.js';
import { logger } from '../infrastructure/logger/index.js';
import { RealtimeService } from './realtime.service.js';

async function checkRateLimit(userId: string): Promise<boolean> {
  const key = `ratelimit:playback:${userId}`;
  const requests = await redis.incr(key);
  if (requests === 1) {
    await redis.expire(key, 1);
  }
  return requests <= 10;
}

function handleCommandError(err: any): { success: false; error: { code: string; message: string } } {
  if (err.statusCode && err.code) {
    return {
      success: false,
      error: { code: err.code, message: err.message }
    };
  }
  logger.error({ err }, 'Playback command failed');
  return {
    success: false,
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' }
  };
}

export function registerPlaybackHandlers(socket: Socket) {
  const userId = socket.data.user?.id;

  const handleCommand = async (
    roomId: string,
    command: 'PLAY' | 'PAUSE' | 'SEEK' | 'RATE',
    payload?: any,
    callback?: (response: any) => void
  ) => {
    if (!roomId || typeof roomId !== 'string') return;
    
    // Rate Limiting
    const isAllowed = await checkRateLimit(userId);
    if (!isAllowed) {
      if (typeof callback === 'function') {
        callback({ success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' } });
      }
      return;
    }

    try {
      const state = await PlaybackService.executeCommand(roomId, userId, command, payload);
      
      // Send acknowledgement first
      if (typeof callback === 'function') {
        callback({ success: true, data: { playback: state } });
      }

      // Broadcast authoritative state to the room
      RealtimeService.emitToRoom(roomId, 'playback:state', state);

    } catch (err) {
      if (typeof callback === 'function') {
        callback(handleCommandError(err));
      }
    }
  };

  socket.on('playback:play', (roomId: string, callback?: (response: any) => void) => {
    handleCommand(roomId, 'PLAY', undefined, callback);
  });

  socket.on('playback:pause', (roomId: string, callback?: (response: any) => void) => {
    handleCommand(roomId, 'PAUSE', undefined, callback);
  });

  socket.on('playback:seek', (data: any, callback?: (response: any) => void) => {
    try {
      const parsed = SeekCommandSchema.parse(data);
      handleCommand(data.roomId, 'SEEK', parsed.positionMs, callback);
    } catch (err) {
      if (typeof callback === 'function') callback(handleCommandError(err));
    }
  });

  socket.on('playback:rate', (data: any, callback?: (response: any) => void) => {
    try {
      const parsed = RateCommandSchema.parse(data);
      handleCommand(data.roomId, 'RATE', parsed.playbackRate, callback);
    } catch (err) {
      if (typeof callback === 'function') callback(handleCommandError(err));
    }
  });
}
