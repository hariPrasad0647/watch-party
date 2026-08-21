import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { logger } from './infrastructure/logger/index.js';
import { errorHandler } from './common/middleware/errorHandler.js';
import healthRoutes from './health/routes.js';
import fastifyCookie from '@fastify/cookie';
import { authRoutes } from './modules/auth/index.js';
import { userRoutes } from './modules/users/index.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger as any,
    disableRequestLogging: true, // we handle this manually or let pino handle it efficiently
    requestIdHeader: 'x-request-id'
  });

  // Global Error Handler
  app.setErrorHandler(errorHandler);

  // Security Headers
  await app.register(helmet, {
    global: true
    // Custom helmet config here if needed
  });

  // Cookies
  await app.register(fastifyCookie);

  // CORS
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true
  });

  // Rate Limiting (Memory based for now, can be switched to Redis later)
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  });

  // Request logging middleware
  app.addHook('onRequest', (request, _reply, done) => {
    logger.info({ req: request }, 'incoming request');
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    logger.info(
      { req: request, res: reply, responseTime: reply.getResponseTime() },
      'request completed'
    );
    done();
  });

  // Register core routes
  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(userRoutes, { prefix: '/api/v1/users' });
  app.register(healthRoutes, { prefix: '/health' });

  return app;
}
