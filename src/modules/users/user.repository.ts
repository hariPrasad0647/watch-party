import { prisma } from '../../infrastructure/database/index.js';
import { Prisma } from '@prisma/client';

export class UserRepository {
  /**
   * Retrieves the current user's profile with selected fields.
   */
  static async findCurrentUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        createdAt: true
      }
    });
  }

  /**
   * Performs a partial update on the user's profile.
   */
  static async updateProfile(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        createdAt: true
      }
    });
  }
}
