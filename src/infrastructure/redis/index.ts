import { Redis } from 'ioredis';
import { logger } from '../logger/index.js';
import { env } from '../../config/env.js';

// We create a primary Redis client.
// Later we can create separate pub/sub clients when we add socket.io redis adapter
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null
});

redis.on('error', (err: Error) => {
  logger.error({ err }, 'Redis connection error');
});

redis.on('ready', () => {
  logger.info('Connected to Redis');
});

export async function connectRedis() {
  try {
    await redis.connect();
  } catch (error) {
    logger.error({ err: error }, 'Failed to connect to Redis');
    throw error;
  }
}

export async function disconnectRedis() {
  try {
    await redis.quit();
    logger.info('Disconnected from Redis');
  } catch (error) {
    logger.error({ err: error }, 'Error disconnecting from Redis');
  }
}
