import { z } from 'zod';

import { VALUE_SETS } from './enums.js';

/** GET /v1/me: the signed-in user and their personal workspace (APIDesign "Account"). */
export const MeSchema = z.object({
  user: z.object({
    id: z.uuid(),
    email: z.email(),
    name: z.string(),
    phone: z.string().nullable(),
    avatarUrl: z.url().nullable(),
    locale: z.string(),
  }),
  workspace: z.object({
    id: z.uuid(),
    name: z.string(),
    plan: z.enum(VALUE_SETS.plan),
  }),
});

export type Me = z.infer<typeof MeSchema>;

/** Indian mobile numbers in E.164 (CLAUDE.md: Indian phone numbers). */
export const IndianMobileSchema = z
  .string()
  .regex(/^\+91[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number');

/** PATCH /v1/me: fields the user can change; omitted fields stay as they are. */
export const UpdateMeSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name').max(80),
    /** null clears it. */
    phone: IndianMobileSchema.nullable(),
  })
  .partial();

export type UpdateMe = z.infer<typeof UpdateMeSchema>;
