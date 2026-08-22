import { z } from 'zod';

export const sendChatMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  clientMessageId: z.string().uuid().optional()
});

export type SendChatMessageDto = z.infer<typeof sendChatMessageSchema>;
