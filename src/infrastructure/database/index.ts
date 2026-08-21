import { PrismaClient } from '@prisma/client';
import { logger } from '../logger/index.js';
import { env } from '../../config/env.js';

export const prisma = new PrismaClient({
  log:
    env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'trace'
      ? ['query', 'info', 'warn', 'error']
      : ['error']
});

export async function connectDatabase() {
  try {
    await prisma.$connect();
    logger.info('Connected to PostgreSQL via Prisma');
  } catch (error) {
    logger.error({ err: error }, 'Failed to connect to PostgreSQL');
    throw error;
  }
}

export async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    logger.info('Disconnected from PostgreSQL');
  } catch (error) {
    logger.error({ err: error }, 'Error disconnecting from PostgreSQL');
  }
}
