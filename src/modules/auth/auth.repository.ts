import { prisma } from '../../infrastructure/database/index.js';
import { Prisma } from '@prisma/client';

export class AuthRepository {
  static async findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email }
    });
  }

  static async findUserById(id: string) {
    return prisma.user.findUnique({
      where: { id }
    });
  }

  static async createUser(data: { email: string; passwordHash: string }) {
    return prisma.user.create({
      data
    });
  }

  static async createRefreshSession(
    tx: Prisma.TransactionClient,
    data: { userId: string; jti: string; tokenHash: string; expiresAt: Date }
  ) {
    return tx.refreshSession.create({
      data
    });
  }

  static async findActiveSessionByJti(jti: string) {
    return prisma.refreshSession.findUnique({
      where: { jti }
    });
  }

  static async revokeSession(jti: string, replacedByJti?: string) {
    return prisma.refreshSession.update({
      where: { jti },
      data: {
        revokedAt: new Date(),
        replacedByJti
      }
    });
  }

  static async revokeAllUserSessions(userId: string) {
    return prisma.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }

  // Exposed for transactional rotation
  static getPrisma() {
    return prisma;
  }
}
