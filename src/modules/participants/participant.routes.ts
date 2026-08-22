import { FastifyInstance } from 'fastify';
import { ParticipantController } from './participant.controller.js';
import { requireAuth } from '../../common/middleware/requireAuth.js';

export async function participantRoutes(fastify: FastifyInstance) {
  fastify.post('/:roomId/join', { preHandler: [requireAuth] }, ParticipantController.joinRoom);
  fastify.post('/:roomId/leave', { preHandler: [requireAuth] }, ParticipantController.leaveRoom);
  fastify.get('/:roomId/participants', { preHandler: [requireAuth] }, ParticipantController.getParticipants);
}
