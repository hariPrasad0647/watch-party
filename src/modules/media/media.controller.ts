import { FastifyReply, FastifyRequest } from 'fastify';
import { MediaService } from './media.service.js';
import { MediaUpdateSchema } from './media.schema.js';
import { z } from 'zod';

const ParamsSchema = z.object({
  roomId: z.string().uuid()
});

export class MediaController {
  static async getMedia(req: FastifyRequest, reply: FastifyReply) {
    const { roomId } = ParamsSchema.parse(req.params);
    const userId = req.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    
    const media = await MediaService.getMedia(roomId, userId);
    return reply.status(200).send({
      success: true,
      data: { media }
    });
  }

  static async updateMedia(req: FastifyRequest, reply: FastifyReply) {
    const { roomId } = ParamsSchema.parse(req.params);
    const payload = MediaUpdateSchema.parse(req.body);
    const userId = req.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const media = await MediaService.updateMedia(roomId, userId, payload);
    return reply.status(200).send({
      success: true,
      data: { media }
    });
  }
}
