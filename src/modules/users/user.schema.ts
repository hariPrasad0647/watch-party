import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .max(50, 'Display name cannot exceed 50 characters')
      .nullable()
      .optional(),

    avatarUrl: z
      .string()
      .url('Invalid URL format')
      .max(2000, 'Avatar URL is too long')
      .nullable()
      .optional(),

    bio: z.string().trim().max(500, 'Bio cannot exceed 500 characters').nullable().optional()
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
