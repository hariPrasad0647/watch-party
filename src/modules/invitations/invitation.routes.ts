import { FastifyInstance } from 'fastify';
import { InvitationController } from './invitation.controller.js';
import { requireAuth } from '../../common/middleware/requireAuth.js';

export async function roomInvitationRoutes(app: FastifyInstance) {
  // All room invitation routes require authentication
  app.addHook('preHandler', requireAuth);

  app.post('/:roomId/invitations', InvitationController.createInvitation);
  app.get('/:roomId/invitations', InvitationController.listInvitations);
  app.delete('/:roomId/invitations/:invitationId', InvitationController.revokeInvitation);
}

export async function globalInvitationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.post('/:token/accept', InvitationController.acceptInvitation);
}
