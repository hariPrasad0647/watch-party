import { z } from 'zod';

export const createInvitationSchema = z.object({
  expiresInSeconds: z.number().int().min(60).max(31536000).optional(),
  maxUses: z.number().int().min(1).max(10000).optional()
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
