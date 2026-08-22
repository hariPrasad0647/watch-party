import { FastifyRequest, FastifyReply } from 'fastify';
import { InvitationService } from './invitation.service.js';
import { createInvitationSchema } from './invitation.schema.js';
import { ValidationError } from '../../common/errors/index.js';

export class InvitationController {
  static async createInvitation(req: FastifyRequest<{ Params: { roomId: string } }>, reply: FastifyReply) {
    const hostId = req.user!.id;
    const roomId = req.params.roomId;
    
    const parsed = createInvitationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid invitation input');
    }

    const result = await InvitationService.createInvitation(hostId, roomId, parsed.data);
    return reply.code(201).send({ success: true, data: result });
  }

  static async listInvitations(
    req: FastifyRequest<{ Params: { roomId: string }; Querystring: { page?: string; limit?: string } }>, 
    reply: FastifyReply
  ) {
    const hostId = req.user!.id;
    const roomId = req.params.roomId;
    
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit || '10')));

    const result = await InvitationService.listInvitations(hostId, roomId, page, limit);
    return reply.send({ success: true, data: result });
  }

  static async revokeInvitation(
    req: FastifyRequest<{ Params: { roomId: string; invitationId: string } }>, 
    reply: FastifyReply
  ) {
    const hostId = req.user!.id;
    const roomId = req.params.roomId;
    const invitationId = req.params.invitationId;

    await InvitationService.revokeInvitation(hostId, roomId, invitationId);
    return reply.send({ success: true, message: 'Invitation revoked successfully' });
  }

  static async acceptInvitation(
    req: FastifyRequest<{ Params: { token: string } }>, 
    reply: FastifyReply
  ) {
    const userId = req.user!.id;
    const token = req.params.token;

    const result = await InvitationService.acceptInvitation(userId, token);
    return reply.send({ success: true, data: result });
  }
}
