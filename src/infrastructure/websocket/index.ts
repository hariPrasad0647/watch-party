import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../logger/index.js';
import { env } from '../../config/env.js';
import { TokenService } from '../../modules/auth/token.service.js';

export let io: SocketIOServer;

export function initializeWebSocket(httpServer: HttpServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST']
    }
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const payload = TokenService.verifyAccessToken(token);
      socket.data.user = { id: payload.sub };
      next();
    } catch (err) {
      return next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'Socket connected');

    socket.on('system:ping', () => {
      socket.emit('system:pong', { timestamp: new Date().toISOString() });
    });

    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'Socket disconnected');
    });
  });

  logger.info('WebSocket (Socket.IO) initialized');
  return io;
}

export function closeWebSocket(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!io) {
      return resolve();
    }

    io.close((err) => {
      if (err) {
        logger.error({ err }, 'Error closing WebSocket server');
        return reject(err);
      }
      logger.info('WebSocket server closed');
      resolve();
    });
  });
}
