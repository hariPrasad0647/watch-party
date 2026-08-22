import { z } from 'zod';

export const roomIdParamSchema = z.object({
  roomId: z.string().uuid('Invalid room ID format')
});
