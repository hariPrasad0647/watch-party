import { z } from 'zod';
import { MediaProvider } from '@prisma/client';

export const MediaProviderSchema = z.nativeEnum(MediaProvider);

export const MediaUpdateSchema = z.object({
  provider: MediaProviderSchema,
  source: z.string().min(1, 'Source is required'),
  title: z.string().optional()
}).refine((data) => {
  if (data.provider === 'YOUTUBE') {
    // Basic YouTube ID validation (11 characters, alphanumeric + dashes + underscores)
    return /^[a-zA-Z0-9_-]{11}$/.test(data.source);
  }
  if (data.provider === 'DIRECT') {
    // Strict URL validation to prevent SSRF and XSS
    try {
      const url = new URL(data.source);
      return url.protocol === 'https:';
    } catch {
      return false;
    }
  }
  return false;
}, {
  message: 'Invalid source for the selected provider. DIRECT URLs must use https://. YOUTUBE expects an 11-character video ID.',
  path: ['source']
});

export type MediaUpdatePayload = z.infer<typeof MediaUpdateSchema>;

export const MediaResponseSchema = z.object({
  id: z.string().uuid(),
  provider: MediaProviderSchema,
  source: z.string(),
  title: z.string().nullable(),
  updatedAt: z.date()
});

export type MediaResponse = z.infer<typeof MediaResponseSchema>;
