import { FastifyInstance } from 'fastify';
import { RoomController } from './room.controller.js';
import { requireAuth } from '../../common/middleware/requireAuth.js';

export async function roomRoutes(app: FastifyInstance) {
  // All room routes require authentication
  app.addHook('preHandler', requireAuth);

  app.post('/', RoomController.createRoom);
  app.get('/', RoomController.listMyRooms);
  app.get('/:roomId', RoomController.getRoom);
  app.patch('/:roomId', RoomController.updateRoom);
  app.post('/:roomId/end', RoomController.endRoom);
}
