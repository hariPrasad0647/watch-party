import { z } from 'zod';
import { ROOM_CONSTANTS } from '../../config/constants.js';

export const createRoomSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(100, 'Name cannot exceed 100 characters'),
    isPrivate: z.boolean().optional(),
    maxParticipants: z
      .number()
      .int()
      .min(ROOM_CONSTANTS.MAX_PARTICIPANTS_MIN)
      .max(ROOM_CONSTANTS.MAX_PARTICIPANTS_ABSOLUTE_MAX)
      .optional()
  })
  .strict();

export const updateRoomSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name cannot be empty')
      .max(100, 'Name cannot exceed 100 characters')
      .optional(),
    isPrivate: z.boolean().optional(),
    maxParticipants: z
      .number()
      .int()
      .min(ROOM_CONSTANTS.MAX_PARTICIPANTS_MIN)
      .max(ROOM_CONSTANTS.MAX_PARTICIPANTS_ABSOLUTE_MAX)
      .optional()
  })
  .strict();

export const roomIdParamSchema = z.object({
  roomId: z.string().uuid('Invalid room ID format')
});
