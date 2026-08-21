import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as Client } from 'socket.io-client';
import { initializeWebSocket, closeWebSocket } from '../../src/infrastructure/websocket/index.js';
import { TokenService } from '../../src/modules/auth/token.service.js';

describe('WebSocket Foundation', () => {
  let io: SocketIOServer;
  let clientSocket: any;
  let httpServer: any;
  let port: number;

  beforeAll(async () => {
    httpServer = createServer();
    io = initializeWebSocket(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const address = httpServer.address();
        port = typeof address === 'string' ? 0 : address?.port || 0;
        resolve();
      });
    });

    const token = TokenService.generateAccessToken('test-user-id', 'test-jti');
    clientSocket = Client(`http://localhost:${port}`, {
      auth: { token }
    });

    io.on('connection', (_socket) => {
      // Intentionally left empty for now
    });

    await new Promise<void>((resolve) => {
      clientSocket.on('connect', resolve);
    });
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    await closeWebSocket();
    httpServer.close();
  });

  it('should respond to system:ping with system:pong', (_testDone) => {
    // Vitest async support using promise or done callback
    return new Promise<void>((resolve) => {
      clientSocket.emit('system:ping');
      clientSocket.on('system:pong', (data: any) => {
        expect(data).toHaveProperty('timestamp');
        resolve();
      });
    });
  });
});
