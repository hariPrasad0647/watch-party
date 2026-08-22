import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ParticipantService } from './participant.service.js';
import { roomIdParamSchema } from './participant.schema.js';

export const ParticipantController = {
  async joinRoom(req: FastifyRequest, reply: FastifyReply) {
    const { roomId } = roomIdParamSchema.parse(req.params);
    const userId = req.user!.id;

    const participant = await ParticipantService.joinRoom(roomId, userId);

    return reply.status(200).send({
      success: true,
      data: {
        participant
      }
    });
  },

  async leaveRoom(req: FastifyRequest, reply: FastifyReply) {
    const { roomId } = roomIdParamSchema.parse(req.params);
    const userId = req.user!.id;

    await ParticipantService.leaveRoom(roomId, userId);

    return reply.status(200).send({
      success: true,
      message: 'Left room successfully'
    });
  },

  async getParticipants(req: FastifyRequest, reply: FastifyReply) {
    const { roomId } = roomIdParamSchema.parse(req.params);
    const userId = req.user!.id;

    const participants = await ParticipantService.getActiveParticipants(roomId, userId);

    return reply.status(200).send({
      success: true,
      data: {
        participants
      }
    });
  }
};
