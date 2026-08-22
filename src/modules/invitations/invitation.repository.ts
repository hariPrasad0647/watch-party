import { Invitation, Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/index.js';
import { getPaginationOptions } from '../../common/utils/pagination.js';

export class InvitationRepository {
  static async createInvitation(data: Prisma.InvitationUncheckedCreateInput): Promise<Invitation> {
    return prisma.invitation.create({ data });
  }

  static async findInvitationsByRoomId(roomId: string, page: number, limit: number) {
    const { skip, take } = getPaginationOptions({ page, limit });

    const [invitations, total] = await prisma.$transaction([
      prisma.invitation.findMany({
        where: { roomId },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      prisma.invitation.count({
        where: { roomId }
      })
    ]);

    return { invitations, total };
  }

  static async findInvitationByTokenHash(tokenHash: string): Promise<Invitation | null> {
    return prisma.invitation.findUnique({
      where: { tokenHash }
    });
  }

  static async findInvitationById(id: string): Promise<Invitation | null> {
    return prisma.invitation.findUnique({
      where: { id }
    });
  }

  static async revokeInvitation(id: string): Promise<Invitation> {
    return prisma.invitation.update({
      where: { id },
      data: { revokedAt: new Date() }
    });
  }
}
