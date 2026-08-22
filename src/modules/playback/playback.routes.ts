import { FastifyInstance } from 'fastify';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { PlaybackController } from './playback.controller.js';

export async function playbackRoutes(app: FastifyInstance) {
  app.get('/:roomId/playback', {
    preHandler: [requireAuth]
  }, PlaybackController.getPlaybackState);
}
