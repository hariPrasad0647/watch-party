import { FastifyRequest, FastifyReply } from 'fastify';
import { UserService } from './user.service.js';
import { updateProfileSchema } from './user.schema.js';
import { ValidationError } from '../../common/errors/index.js';

export class UserController {
  /**
   * Get current user profile
   */
  static async getMe(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const user = await UserService.getCurrentUserProfile(userId);

    return reply.status(200).send({
      success: true,
      data: { user }
    });
  }

  /**
   * Update current user profile
   */
  static async updateMe(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    
    const parseResult = updateProfileSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation error');
    }

    const updatedUser = await UserService.updateCurrentUserProfile(userId, parseResult.data);

    return reply.status(200).send({
      success: true,
      data: { user: updatedUser }
    });
  }
}
