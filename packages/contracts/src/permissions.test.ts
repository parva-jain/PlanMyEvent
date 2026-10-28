import { describe, expect, it } from 'vitest';

import { can, canSomewhere, PERMISSIONS, STANDARD_ROLES, subEventsWith } from './permissions.js';

const helper = {
  wholeEvent: ['event.view' as const],
  subEvents: { mehendi: ['tasks.edit' as const] },
};

describe('can', () => {
  it('whole-event grants cover every sub-event; scoped ones only their own', () => {
    expect(can(helper, 'event.view')).toBe(true);
    expect(can(helper, 'event.view', 'haldi')).toBe(true);
    expect(can(helper, 'tasks.edit', 'mehendi')).toBe(true);
    expect(can(helper, 'tasks.edit', 'haldi')).toBe(false);
    // Rows with no sub-event need a whole-event grant.
    expect(can(helper, 'tasks.edit')).toBe(false);
    expect(canSomewhere(helper, 'tasks.edit')).toBe(true);
    expect(subEventsWith(helper, 'tasks.edit')).toEqual(new Set(['mehendi']));
    expect(subEventsWith(helper, 'event.view')).toBe('all');
  });
});

describe('STANDARD_ROLES', () => {
  it('Owner has everything, Admin all but event.delete, Viewer only views', () => {
    const [owner, admin, , , viewer] = STANDARD_ROLES;
    expect(owner.permissions).toEqual([...PERMISSIONS]);
    expect(PERMISSIONS.filter((p) => !(admin.permissions as string[]).includes(p))).toEqual([
      'event.delete',
    ]);
    expect(viewer.permissions.every((p) => p.endsWith('.view'))).toBe(true);
  });
});
