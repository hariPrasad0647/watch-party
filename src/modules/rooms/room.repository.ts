import { PrismaClient, Room, Prisma } from '@prisma/client';
import { getPaginationOptions } from '../../common/utils/pagination.js';
import { prisma } from '../../infrastructure/database/index.js';

export class RoomRepository {
  static getPrisma() {
    return prisma;
  }

  static async createRoom(data: Prisma.RoomUncheckedCreateInput): Promise<Room> {
    return prisma.room.create({
      data
    });
  }

  static async findById(id: string): Promise<Room | null> {
    return prisma.room.findUnique({
      where: { id }
    });
  }

  static async findRoomsByHostId(hostId: string, page: number, limit: number) {
    const { skip, take } = getPaginationOptions({ page, limit });

    const [rooms, total] = await prisma.$transaction([
      prisma.room.findMany({
        where: { hostId },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      prisma.room.count({
        where: { hostId }
      })
    ]);

    return { rooms, total };
  }

  static async updateRoom(id: string, data: Prisma.RoomUpdateInput): Promise<Room> {
    return prisma.room.update({
      where: { id },
      data
    });
  }

  /**
   * Attempts an atomic ACTIVE -> ENDED transition.
   * Returns the updated room if successful.
   * Will throw a Prisma P2025 (Record to update not found) if the room doesn't exist OR is already ended.
   */
  static async endRoomAtomic(id: string): Promise<Room> {
    return prisma.room.update({
      where: {
        id,
        status: 'ACTIVE'
      },
      data: {
        status: 'ENDED',
        endedAt: new Date()
      }
    });
  }
}
