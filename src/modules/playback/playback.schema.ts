import { z } from 'zod';

export const PlaybackStatusSchema = z.enum(['PLAYING', 'PAUSED']);

export const PlaybackStateSchema = z.object({
  roomId: z.string().uuid(),
  version: z.number().int().min(0),
  status: PlaybackStatusSchema,
  basePositionMs: z.number().int().min(0),
  playbackRate: z.number().min(0.25).max(4.0),
  serverTimestamp: z.number().int(), // Unix epoch in ms
  mediaId: z.string().nullable()
});

export type PlaybackState = z.infer<typeof PlaybackStateSchema>;

export const SeekCommandSchema = z.object({
  positionMs: z.number().int().min(0)
});

export type SeekCommand = z.infer<typeof SeekCommandSchema>;

export const RateCommandSchema = z.object({
  playbackRate: z.number().min(0.25).max(4.0)
});

export type RateCommand = z.infer<typeof RateCommandSchema>;
