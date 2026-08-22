import { FastifyReply, FastifyRequest } from 'fastify';
import { PlaybackService } from './playback.service.js';
import { z } from 'zod';

const ParamsSchema = z.object({
  roomId: z.string().uuid()
});

export class PlaybackController {
  static async getPlaybackState(req: FastifyRequest, reply: FastifyReply) {
    const { roomId } = ParamsSchema.parse(req.params);
    const userId = req.user.id;
    const state = await PlaybackService.getStatus(roomId, userId);
    return reply.status(200).send({
      success: true,
      data: {
        playback: state
      }
    });
  }
}
