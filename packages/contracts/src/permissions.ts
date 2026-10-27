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
