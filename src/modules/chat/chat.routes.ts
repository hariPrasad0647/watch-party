import { FastifyInstance } from 'fastify';
import { ChatController } from './chat.controller.js';
import { requireAuth } from '../../common/middleware/requireAuth.js';

export async function chatRoutes(app: FastifyInstance) {
  // All chat routes require authentication
  app.addHook('preHandler', requireAuth);

  app.get('/:roomId/messages', ChatController.getMessages);
}
