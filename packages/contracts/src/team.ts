import { z } from 'zod';

import { MemberStatusSchema, EventTypeSchema } from './enums.js';
import { DateOnlySchema } from './events.js';
import { EffectivePermissionsSchema, PermissionSchema } from './permissions.js';

/** Permissions without duplicates; order doesn't matter. */
const PermissionSetSchema = z
  .array(PermissionSchema)
  .max(100)
  .refine((list) => new Set(list).size === list.length, { message: 'Listed twice' });

// ---- Roles -------------------------------------------------------------------------------

export const RoleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  isStandard: z.boolean(),
  /** The single Owner role: never edited, deleted, or assigned except by transfer. */
  isOwner: z.boolean(),
  permissions: z.array(PermissionSchema),
  /** Active members holding it. */
  memberCount: z.number().int().nonnegative(),
  version: z.number().int().positive(),
});
export type Role = z.infer<typeof RoleSchema>;

export const CreateRoleSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60),
  description: z.string().trim().max(200).nullable().optional(),
  permissions: PermissionSetSchema,
});
export type CreateRole = z.infer<typeof CreateRoleSchema>;

export const UpdateRoleSchema = CreateRoleSchema.partial();
export type UpdateRole = z.infer<typeof UpdateRoleSchema>;

/** GET /v1/permissions: the catalog for the role editor; labels live in the web app. */
export const PermissionInfoSchema = z.object({ key: PermissionSchema, area: z.string() });
export type PermissionInfo = z.infer<typeof PermissionInfoSchema>;

// ---- Grants and members -----------------------------------------------------------------

/** A role, for the whole event (no sub-events) or only inside the listed sub-events. */
export const GrantSchema = z.object({
  roleId: z.uuid(),
  subEventIds: z
    .array(z.uuid())
    .max(50)
    .refine((list) => new Set(list).size === list.length, { message: 'Listed twice' })
    .default([]),
});
export type Grant = z.infer<typeof GrantSchema>;

const GrantListSchema = z
  .array(GrantSchema)
  .min(1, 'Choose at least one role')
  .max(10)
  .refine((list) => new Set(list.map((grant) => grant.roleId)).size === list.length, {
    message: 'Each role once',
  });

export const AssignmentSchema = z.object({
  roleId: z.uuid(),
  roleName: z.string(),
  /** Empty: the whole event. */
  subEventIds: z.array(z.uuid()),
});
export type Assignment = z.infer<typeof AssignmentSchema>;

export const MemberSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  email: z.email(),
  avatarUrl: z.url().nullable(),
  status: MemberStatusSchema,
  isOwner: z.boolean(),
  joinedAt: z.iso.datetime({ offset: true }),
  assignments: z.array(AssignmentSchema),
  version: z.number().int().positive(),
});
export type Member = z.infer<typeof MemberSchema>;

/** PUT E/members/{memberId}/roles: replaces every assignment and scope. */
export const ReplaceMemberRolesSchema = z.object({ assignments: GrantListSchema });
export type ReplaceMemberRoles = z.infer<typeof ReplaceMemberRolesSchema>;

/** GET E/me: my member record and effective permissions (APIDesign "Permissions the client can read"). */
export const MyMembershipSchema = z.object({
  member: MemberSchema,
  permissions: EffectivePermissionsSchema,
});
export type MyMembership = z.infer<typeof MyMembershipSchema>;

/** POST E/transfer-ownership: the new owner, and the role the old owner keeps (e.g. Admin). */
export const TransferOwnershipSchema = z.object({ memberId: z.uuid(), keepRoleId: z.uuid() });
export type TransferOwnership = z.infer<typeof TransferOwnershipSchema>;

// ---- Member invites -------------------------------------------------------------------------

export const MemberInviteSchema = z.object({
  id: z.uuid(),
  /** Set for email invites; null for shareable links. */
  email: z.email().nullable(),
  grants: z.array(GrantSchema),
  maxUses: z.number().int().positive(),
  usedCount: z.number().int().nonnegative(),
  expiresAt: z.iso.datetime({ offset: true }),
  createdAt: z.iso.datetime({ offset: true }),
  createdBy: z.object({ name: z.string() }),
});
export type MemberInvite = z.infer<typeof MemberInviteSchema>;

export const CreateMemberInviteSchema = z
  .object({
    email: z.email().max(254).optional(),
    grants: GrantListSchema,
    /** How many people may join through a shareable link. Email invites are single-use. */
    maxUses: z.number().int().min(1).max(100).default(1),
    expiresInDays: z.number().int().min(1).max(30).default(7),
  })
  .refine((value) => !value.email || value.maxUses === 1, {
    message: 'An email invite is for one person',
    path: ['maxUses'],
  });
export type CreateMemberInvite = z.infer<typeof CreateMemberInviteSchema>;

/** The created invite with its link token, returned once and never stored (CLAUDE.md rule 6). */
export const CreatedMemberInviteSchema = MemberInviteSchema.extend({ token: z.string() });
export type CreatedMemberInvite = z.infer<typeof CreatedMemberInviteSchema>;

/** GET /v1/member-invites/{token}: what the link offers, for anyone holding it. */
export const MemberInvitePreviewSchema = z.object({
  event: z.object({
    name: z.string(),
    type: EventTypeSchema,
    startsOn: DateOnlySchema,
    endsOn: DateOnlySchema,
  }),
  invitedBy: z.object({ name: z.string() }),
  /** Email invites only, masked ("pr***@gmail.com"), so the invitee picks the right account. */
  emailHint: z.string().nullable(),
  roles: z.array(z.object({ name: z.string(), subEvents: z.array(z.string()) })),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type MemberInvitePreview = z.infer<typeof MemberInvitePreviewSchema>;

/** POST /v1/member-invites/{token}/accept. `joined` is false when already a member. */
export const AcceptedMemberInviteSchema = z.object({ eventId: z.uuid(), joined: z.boolean() });
export type AcceptedMemberInvite = z.infer<typeof AcceptedMemberInviteSchema>;
