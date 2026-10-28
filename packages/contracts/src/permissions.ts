import { z } from 'zod';

/**
 * Permission catalog (PRD "Roles and permissions", DatabaseDesign "Permission catalog").
 * Code, not data: roles store these strings and writes reject anything else.
 */
export const PERMISSIONS = [
  'event.view',
  'event.settings',
  'event.delete',
  'members.view',
  'members.manage',
  'roles.manage',
  'subevents.view',
  'subevents.edit',
  'tasks.view',
  'tasks.edit',
  'tasks.assign',
  'tasks.update_own',
  'budget.view',
  'budget.edit',
  'guests.view',
  'guests.edit',
  'guests.invite',
  'registrations.view',
  'registrations.manage',
  'checkin.perform',
  'website.edit',
  'gallery.upload',
  'gallery.manage',
  'activity.view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PermissionSchema = z.enum(PERMISSIONS);

export const isPermission = (value: string): value is Permission =>
  (PERMISSIONS as readonly string[]).includes(value);

/** The PRD's areas, for grouping in the role editor. The area is the part before the dot. */
export const permissionArea = (permission: Permission) => permission.split('.')[0]!;

/**
 * Standard roles copied into every event at creation (PRD "Standard roles"). Later edits to
 * these presets never change existing events. Owner and Admin differ only in event.delete;
 * transferring ownership is the Owner's alone and not a permission.
 */
export const STANDARD_ROLES = [
  { key: 'owner', name: 'Owner', isOwner: true, permissions: [...PERMISSIONS] },
  {
    key: 'admin',
    name: 'Admin',
    isOwner: false,
    permissions: PERMISSIONS.filter((permission) => permission !== 'event.delete'),
  },
  {
    key: 'editor',
    name: 'Editor',
    isOwner: false,
    permissions: [
      'event.view',
      'members.view',
      'subevents.view',
      'subevents.edit',
      'tasks.view',
      'tasks.edit',
      'tasks.assign',
      'budget.view',
      'budget.edit',
      'guests.view',
      'guests.edit',
      'guests.invite',
      'registrations.view',
      'registrations.manage',
      'checkin.perform',
      'gallery.upload',
      'activity.view',
    ],
  },
  {
    key: 'helper',
    name: 'Helper',
    isOwner: false,
    permissions: [
      'event.view',
      'members.view',
      'subevents.view',
      'tasks.view',
      'tasks.update_own',
      'checkin.perform',
      'gallery.upload',
    ],
  },
  {
    key: 'viewer',
    name: 'Viewer',
    isOwner: false,
    permissions: PERMISSIONS.filter((permission) => permission.endsWith('.view')),
  },
] as const satisfies readonly {
  key: string;
  name: string;
  isOwner: boolean;
  permissions: readonly Permission[];
}[];

export type StandardRoleKey = (typeof STANDARD_ROLES)[number]['key'];

/**
 * A member's effective permissions (PRD rule 4): the union of their whole-event grants, plus
 * extra sets that apply only inside particular sub-events. GET E/me returns this shape, so
 * the web app uses the same `can` as the API guard to hide what the caller can't do.
 */
export const EffectivePermissionsSchema = z.object({
  wholeEvent: z.array(PermissionSchema),
  /** Sub-event id → permissions granted only there (whole-event ones are not repeated). */
  subEvents: z.record(z.uuid(), z.array(PermissionSchema)),
});
export type EffectivePermissions = z.infer<typeof EffectivePermissionsSchema>;

/**
 * Whether `permission` applies. With a sub-event, a grant for the whole event or for that
 * sub-event counts; without one (event-wide rows and routes), only a whole-event grant does.
 */
export function can(
  permissions: EffectivePermissions,
  permission: Permission,
  subEventId?: string | null,
): boolean {
  if (permissions.wholeEvent.includes(permission)) return true;
  return Boolean(subEventId && permissions.subEvents[subEventId]?.includes(permission));
}

/** Granted for the whole event or for at least one sub-event: list routes filter by scope. */
export function canSomewhere(permissions: EffectivePermissions, permission: Permission): boolean {
  return (
    permissions.wholeEvent.includes(permission) ||
    Object.values(permissions.subEvents).some((list) => list.includes(permission))
  );
}

/** Sub-events where `permission` applies, or 'all' when it is granted for the whole event. */
export function subEventsWith(
  permissions: EffectivePermissions,
  permission: Permission,
): 'all' | Set<string> {
  if (permissions.wholeEvent.includes(permission)) return 'all';
  return new Set(
    Object.entries(permissions.subEvents)
      .filter(([, list]) => list.includes(permission))
      .map(([id]) => id),
  );
}
