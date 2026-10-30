import { z } from 'zod';

/**
 * A phone number in E.164, or null if it can't be one. India first: a 10-digit mobile, or one
 * written with 0, 91 or +91 in front, becomes +91…; other countries need their + prefix.
 * Spaces, dashes, dots and brackets are ignored.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim().replace(/[\s\-().]/g, '');
  const international = raw.startsWith('+')
    ? raw.slice(1)
    : raw.startsWith('00')
      ? raw.slice(2)
      : null;
  if (international !== null) {
    return /^[1-9]\d{7,14}$/.test(international) ? `+${international}` : null;
  }
  if (!/^\d+$/.test(raw)) return null;
  const local =
    raw.length === 11 && raw.startsWith('0')
      ? raw.slice(1)
      : raw.length === 12 && raw.startsWith('91')
        ? raw.slice(2)
        : raw;
  return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
}

/** A phone as typed; the server stores normalizePhone's E.164 form. */
export const PhoneSchema = z
  .string()
  .trim()
  .max(24)
  .refine((value) => normalizePhone(value) !== null, 'Enter a valid phone number');

/** "VIP", "Bride side", "Speaker": trimmed, compared ignoring case. */
export const TagsSchema = z
  .array(z.string().trim().min(1).max(30))
  .max(20)
  .transform((tags) => {
    const seen = new Set<string>();
    return tags.filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

const listQuery = {
  /** Name search (trigram match). */
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
};

// ---- Households -----------------------------------------------------------------------------

export const HouseholdSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** The organizer's estimate; invite-only headcounts add these up. */
  expectedCount: z.number().int(),
  /** Whose phone gets the invitation; one of the household's contacts. */
  primaryContactId: z.uuid().nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type Household = z.infer<typeof HouseholdSchema>;

const householdFields = {
  name: z.string().trim().min(1, 'Enter a name').max(120),
  expectedCount: z.number().int().min(1, 'At least 1').max(50, 'At most 50'),
};

export const CreateHouseholdSchema = z.object(householdFields).partial().required({ name: true });
export type CreateHousehold = z.infer<typeof CreateHouseholdSchema>;

export const UpdateHouseholdSchema = z
  .object({ ...householdFields, primaryContactId: z.uuid().nullable() })
  .partial();
export type UpdateHousehold = z.infer<typeof UpdateHouseholdSchema>;

export const HouseholdQuerySchema = z.object(listQuery);
export type HouseholdQuery = z.infer<typeof HouseholdQuerySchema>;

// ---- Contacts -------------------------------------------------------------------------------

export const ContactSchema = z.object({
  id: z.uuid(),
  /** Null when not in a household, or when its household was deleted. */
  householdId: z.uuid().nullable(),
  name: z.string(),
  /** E.164. */
  phone: z.string().nullable(),
  email: z.string().nullable(),
  tags: z.array(z.string()),
  notes: z.string().nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type Contact = z.infer<typeof ContactSchema>;

const contactFields = {
  householdId: z.uuid().nullable(),
  name: z.string().trim().min(1, 'Enter a name').max(120),
  phone: PhoneSchema.nullable(),
  email: z.email('Enter a valid email').max(254).nullable(),
  tags: TagsSchema,
  notes: z.string().trim().max(2_000).nullable(),
};

export const CreateContactSchema = z.object(contactFields).partial().required({ name: true });
export type CreateContact = z.infer<typeof CreateContactSchema>;

export const UpdateContactSchema = z.object(contactFields).partial();
export type UpdateContact = z.infer<typeof UpdateContactSchema>;

export const ContactQuerySchema = z.object({
  ...listQuery,
  tag: z.string().trim().max(30).optional(),
  householdId: z.uuid().optional(),
});
export type ContactQuery = z.infer<typeof ContactQuerySchema>;
