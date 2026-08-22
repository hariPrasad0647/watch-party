import { FastifyRequest, FastifyReply } from 'fastify';
import { ChatService } from './chat.service.js';
import { z } from 'zod';

const getMessagesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  before: z.string().optional(),
  after: z.string().optional()
}).refine(data => !(data.before && data.after), {
  message: "Cannot provide both 'before' and 'after' cursors",
  path: ['before', 'after']
});

export class ChatController {
  static async getMessages(
    request: FastifyRequest<{ Params: { roomId: string }; Querystring: any }>,
    reply: FastifyReply
  ) {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { roomId } = request.params;
    
    const parsedQuery = getMessagesQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsedQuery.error.format()
      });
    }

    const result = await ChatService.getMessages(userId, roomId, parsedQuery.data);
    return reply.status(200).send(result);
  }
}
