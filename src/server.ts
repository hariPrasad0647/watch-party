import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './infrastructure/logger/index.js';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/index.js';
import { connectRedis, disconnectRedis } from './infrastructure/redis/index.js';
import { initializeWebSocket, closeWebSocket } from './infrastructure/websocket/index.js';
import { closeQueues } from './infrastructure/queue/index.js';

async function start() {
  try {
    // 1. Initialize infrastructure
    await connectDatabase();
    await connectRedis();

    // 2. Build Fastify app
    const app = await buildApp();

    // 3. Start Fastify server
    await app.listen({ port: env.PORT, host: env.HOST });

    // 4. Attach WebSocket (Socket.IO) to the raw HTTP server
    initializeWebSocket(app.server);

    logger.info(`Server listening on http://${env.HOST}:${env.PORT}`);

    // Graceful Shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      try {
        // Stop accepting new HTTP requests
        await app.close();

        // Close WebSocket server
        await closeWebSocket();

        // Close queues
        await closeQueues();

        // Close Redis
        await disconnectRedis();

        // Disconnect DB
        await disconnectDatabase();

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();
