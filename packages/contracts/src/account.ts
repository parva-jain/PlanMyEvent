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
