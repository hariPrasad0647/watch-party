import { UserRepository } from './user.repository.js';
import { NotFoundError } from '../../common/errors/index.js';
import { UpdateProfileInput } from './user.schema.js';
import { logger } from '../../infrastructure/logger/index.js';
import { Prisma } from '@prisma/client';

export class UserService {
  /**
   * Get the current user's profile
   */
  static async getCurrentUserProfile(userId: string) {
    const user = await UserRepository.findCurrentUserById(userId);
    
    if (!user) {
      throw new NotFoundError('User not found');
    }
    
    return user;
  }

  /**
   * Update the current user's profile
   */
  static async updateCurrentUserProfile(userId: string, data: UpdateProfileInput) {
    // Ensure the user exists before updating
    await this.getCurrentUserProfile(userId);

    // Map the undefined vs null semantics explicitly for Prisma
    // field omitted (undefined) -> ignored by Prisma
    // field = null -> sets to null in DB
    // field = string -> updates to string
    const updateData: Prisma.UserUpdateInput = {};

    if (data.displayName !== undefined) {
      updateData.displayName = data.displayName;
    }
    if (data.avatarUrl !== undefined) {
      updateData.avatarUrl = data.avatarUrl;
    }
    if (data.bio !== undefined) {
      updateData.bio = data.bio;
    }

    const updatedUser = await UserRepository.updateProfile(userId, updateData);
    
    logger.info({ userId }, 'profile_updated');
    
    return updatedUser;
  }
}
