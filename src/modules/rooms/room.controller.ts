import { FastifyRequest, FastifyReply } from 'fastify';
import { RoomService } from './room.service.js';
import { createRoomSchema, updateRoomSchema, roomIdParamSchema } from './room.schema.js';
import { ValidationError } from '../../common/errors/index.js';

export class RoomController {
  /**
   * Create a new room
   */
  static async createRoom(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;

    const parseResult = createRoomSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation error');
    }

    const room = await RoomService.createRoom(userId, parseResult.data);

    return reply.status(201).send({
      success: true,
      data: { room }
    });
  }

  /**
   * Get a room by ID
   */
  static async getRoom(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;

    const parseResult = roomIdParamSchema.safeParse(request.params);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation error');
    }

    const room = await RoomService.getRoom(userId, parseResult.data.roomId);

    return reply.status(200).send({
      success: true,
      data: { room }
    });
  }

  /**
   * Get authenticated user's rooms
   */
  static async listMyRooms(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const query = request.query as any;

    const page = parseInt(query.page as string, 10) || 1;
    const limit = parseInt(query.limit as string, 10) || 10;

    const result = await RoomService.listMyRooms(userId, { page, limit });

    return reply.status(200).send({
      success: true,
      data: result
    });
  }

  /**
   * Update a room
   */
  static async updateRoom(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;

    const paramsParse = roomIdParamSchema.safeParse(request.params);
    if (!paramsParse.success) {
      throw new ValidationError(paramsParse.error.errors[0]?.message || 'Validation error');
    }

    const bodyParse = updateRoomSchema.safeParse(request.body);
    if (!bodyParse.success) {
      throw new ValidationError(bodyParse.error.errors[0]?.message || 'Validation error');
    }

    // Reject empty payload
    if (Object.keys(bodyParse.data).length === 0) {
      throw new ValidationError('No fields provided to update');
    }

    const room = await RoomService.updateRoom(userId, paramsParse.data.roomId, bodyParse.data);

    return reply.status(200).send({
      success: true,
      data: { room }
    });
  }

  /**
   * End a room
   */
  static async endRoom(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;

    const parseResult = roomIdParamSchema.safeParse(request.params);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation error');
    }

    const room = await RoomService.endRoom(userId, parseResult.data.roomId);

    return reply.status(200).send({
      success: true,
      data: { room }
    });
  }
}
