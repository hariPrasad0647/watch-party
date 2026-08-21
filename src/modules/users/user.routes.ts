import { FastifyInstance } from 'fastify';
import { UserController } from './user.controller.js';
import { requireAuth } from '../../common/middleware/requireAuth.js';

export async function userRoutes(fastify: FastifyInstance) {
  // All user routes require authentication
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/me', UserController.getMe);
  fastify.patch('/me', UserController.updateMe);
}
