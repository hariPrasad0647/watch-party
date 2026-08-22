import { FastifyInstance } from 'fastify';
import { MediaController } from './media.controller.js';
import { requireAuth } from '../../common/middleware/requireAuth.js';

export async function mediaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/:roomId/media', MediaController.getMedia);
  app.put('/:roomId/media', MediaController.updateMedia);
}
