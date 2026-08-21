import { FastifyInstance } from 'fastify';
import { prisma } from '../infrastructure/database/index.js';
import { redis } from '../infrastructure/redis/index.js';

export default async function healthRoutes(app: FastifyInstance) {
  // Simple liveness check
  app.get('/live', async (_request, reply) => {
    return reply.send({ success: true, status: 'alive' });
  });

  // Readiness check that validates core dependencies
  app.get('/ready', async (request, reply) => {
    try {
      // Check Postgres
      await prisma.$queryRaw`SELECT 1`;

      // Check Redis
      await redis.ping();

      return reply.send({
        success: true,
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      request.log.error({ err: error }, 'Readiness check failed');
      return reply.status(503).send({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'One or more core dependencies are unavailable'
        }
      });
    }
  });

  // Root health route
  app.get('/', async (_request, reply) => {
    return reply.send({ success: true, status: 'ok' });
  });
}
