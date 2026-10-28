import { PERMISSIONS, type Grant, type Permission } from '@pme/contracts';
import { describe, expect, it } from 'vitest';

import { runAction, type ActionDefinition } from '../action.js';
import type { ActionContext } from '../context.js';
import { createEvent, updateEvent } from '../events/event-actions.js';
import { createSubEvent, deleteSubEvent, updateSubEvent } from '../events/program-actions.js';
import type { CoreTx } from '../ports.js';
import { memoryRuntime } from '../testing/memory-tx.js';
import { resolvePermissions } from './access.js';
import { acceptMemberInvite, createMemberInvite, revokeMemberInvite } from './invite-actions.js';
import {
  leaveEvent,
  removeMember,
  replaceMemberRoles,
  transferOwnership,
} from './member-actions.js';
import { createRole, deleteRole, updateRole } from './role-actions.js';

const ctxFor = (userId: string, eventId: string | null): ActionContext => ({
  requestId: 'req_test',
  channel: 'app',
  actor: { kind: 'user', userId, memberId: null },
  eventId,
  now: new Date('2026-10-28T00:00:00Z'),
});

async function wedding() {
  const memory = memoryRuntime();
  memory.workspaces.set('owner', { id: 'ws1', name: "Priya's workspace", plan: 'free' });
  memory.profiles.set('owner', { name: 'Priya' });
  const event = await runAction(memory.runtime, ctxFor('owner', null), createEvent, {
    templateKey: 'wedding',
    name: 'Sharma Wedding',
    startsOn: '2026-12-10',
    endsOn: '2026-12-12',
    timeZone: 'Asia/Kolkata',
  });
  const roles = [...memory.roles.values()];
  const role = (name: string) => roles.find((item) => item.name === name)!;
  const subEvents = [...memory.subEvents.values()];
  const subEvent = (name: string) => subEvents.find((item) => item.name === name)!;
  const run = <I, R>(userId: string, action: ActionDefinition<I, R, CoreTx>, input: I) =>
    runAction(memory.runtime, ctxFor(userId, event.id), action, input);

  /** Adds a member directly, the way an accepted invite would. */
  async function addMember(userId: string, grants: Grant[]) {
    const member = await memory.tx.members.join(event.id, userId, 'owner');
    await memory.tx.members.replaceAssignments(event.id, member.id, grants, 'owner');
    return (await memory.tx.members.find(event.id, member.id))!;
  }
  const customRole = async (name: string, permissions: Permission[]) => {
    const created = await runAction(memory.runtime, ctxFor('owner', event.id), createRole, {
      name,
      permissions,
    });
    return created;
  };
  return { ...memory, event, role, subEvent, run, addMember, customRole };
}

describe('resolvePermissions', () => {
  it('unions per scope, leaving whole-event permissions out of sub-event sets', () => {
    expect(
      resolvePermissions([
        { subEventId: null, permissions: ['event.view', 'tasks.view'] },
        { subEventId: 'mehendi', permissions: ['tasks.view', 'tasks.edit', 'not.real'] },
        { subEventId: 'mehendi', permissions: ['budget.view'] },
        { subEventId: 'haldi', permissions: ['event.view'] },
      ]),
    ).toEqual({
      wholeEvent: ['event.view', 'tasks.view'],
      subEvents: { mehendi: ['budget.view', 'tasks.edit'] },
    });
  });
});

describe('createEvent', () => {
  it('copies the five standard roles and makes the creator the Owner', async () => {
    const { tx, event, roles } = await wedding();
    expect([...roles.values()].map((role) => role.name)).toEqual([
      'Owner',
      'Admin',
      'Editor',
      'Helper',
      'Viewer',
    ]);
    const access = await tx.access.forUser(event.id, 'owner');
    expect(access).toMatchObject({ isOwner: true, subEvents: {} });
    expect(access!.wholeEvent).toHaveLength(PERMISSIONS.length);
  });
});

describe('permission checks', () => {
  it('answers 404 to non-members and 403 naming the permission to members without it', async () => {
    const { runtime, event, role, addMember } = await wedding();
    const changes = { expectedVersion: 1, changes: { name: 'Hijacked' } };
    await expect(
      runAction(runtime, ctxFor('stranger', event.id), updateEvent, changes),
    ).rejects.toMatchObject({ code: 'not_found' });

    await addMember('viewer', [{ roleId: role('Viewer').id, subEventIds: [] }]);
    await expect(
      runAction(runtime, ctxFor('viewer', event.id), updateEvent, changes),
    ).rejects.toMatchObject({ code: 'forbidden', details: { permission: 'event.settings' } });
  });

  it('a grant scoped to one sub-event works there and nowhere else', async () => {
    const { runtime, event, subEvent, addMember, customRole } = await wedding();
    const decor = await customRole('Decor', ['event.view', 'subevents.view', 'subevents.edit']);
    const mehendi = subEvent('Mehendi');
    const haldi = subEvent('Haldi');
    await addMember('decor', [{ roleId: decor.id, subEventIds: [mehendi.id] }]);
    const ctx = ctxFor('decor', event.id);

    await expect(
      runAction(runtime, ctx, updateSubEvent, {
        subEventId: mehendi.id,
        expectedVersion: 1,
        changes: { capacity: 120 },
      }),
    ).resolves.toMatchObject({ capacity: 120 });
    await expect(
      runAction(runtime, ctx, updateSubEvent, {
        subEventId: haldi.id,
        expectedVersion: 1,
        changes: { capacity: 120 },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    // Creating a sub-event is event-wide: a scoped grant doesn't cover it.
    await expect(
      runAction(runtime, ctx, createSubEvent, {
        name: 'Extra',
        startsAt: '2026-12-11T10:00:00Z',
        endsAt: '2026-12-11T11:00:00Z',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('deleting the last scoped sub-event drops the assignment instead of widening it', async () => {
    const { runtime, tx, event, subEvent, addMember, customRole, rolesVersion } = await wedding();
    const decor = await customRole('Decor', ['event.view', 'subevents.edit']);
    const mehendi = subEvent('Mehendi');
    const member = await addMember('decor', [{ roleId: decor.id, subEventIds: [mehendi.id] }]);
    const before = rolesVersion.get(event.id)!;

    await runAction(runtime, ctxFor('owner', event.id), deleteSubEvent, {
      subEventId: mehendi.id,
      expectedVersion: 1,
    });
    expect((await tx.members.find(event.id, member.id))!.assignments).toEqual([]);
    expect(await tx.access.forUser(event.id, 'decor')).toMatchObject({ wholeEvent: [] });
    expect(rolesVersion.get(event.id)).toBe(before + 1);
  });
});

describe('roles', () => {
  it('creates custom roles within your own permissions, with unique names', async () => {
    const { run, role, addMember, rolesVersion, event } = await wedding();
    await addMember('editor', [{ roleId: role('Editor').id, subEventIds: [] }]);
    // Give the editor roles.manage through a second role, but nothing else extra.
    const manager = await run<{ name: string; permissions: Permission[] }, { id: string }>(
      'owner',
      createRole,
      { name: 'Role manager', permissions: ['roles.manage'] },
    );
    await addMember('editor', [
      { roleId: role('Editor').id, subEventIds: [] },
      { roleId: manager.id, subEventIds: [] },
    ]);
    const version = rolesVersion.get(event.id)!;

    await expect(
      run('editor', createRole, {
        name: 'Treasurer',
        permissions: ['budget.edit', 'event.delete'],
      }),
    ).rejects.toMatchObject({ code: 'forbidden', details: { permissions: ['event.delete'] } });
    await expect(
      run('editor', createRole, { name: 'Treasurer', permissions: ['budget.view', 'budget.edit'] }),
    ).resolves.toMatchObject({ isStandard: false, memberCount: 0 });
    expect(rolesVersion.get(event.id)).toBe(version + 1);
    await expect(
      run('owner', createRole, { name: 'treasurer', permissions: [] }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('never changes the Owner role and refuses to delete a role in use', async () => {
    const { run, role, addMember } = await wedding();
    await expect(
      run('owner', updateRole, {
        roleId: role('Owner').id,
        expectedVersion: 1,
        changes: { name: 'Boss' },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      run('owner', deleteRole, { roleId: role('Owner').id, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'forbidden' });

    await addMember('helper', [{ roleId: role('Helper').id, subEventIds: [] }]);
    await expect(
      run('owner', deleteRole, { roleId: role('Helper').id, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'role_in_use', details: { memberCount: 1 } });
    await expect(
      run('owner', deleteRole, { roleId: role('Viewer').id, expectedVersion: 1 }),
    ).resolves.toBeUndefined();
    // Standard roles stay editable.
    await expect(
      run('owner', updateRole, {
        roleId: role('Editor').id,
        expectedVersion: 1,
        changes: { name: 'Planner' },
      }),
    ).resolves.toMatchObject({ name: 'Planner', version: 2 });
  });
});

describe('members', () => {
  it('replaces roles under the member version; never the Owner role', async () => {
    const { run, role, addMember, subEvent } = await wedding();
    const member = await addMember('helper', [{ roleId: role('Helper').id, subEventIds: [] }]);
    const assign = (roleId: string, expectedVersion = member.version, subEventIds: string[] = []) =>
      run('owner', replaceMemberRoles, {
        memberId: member.id,
        expectedVersion,
        body: { assignments: [{ roleId, subEventIds }] },
      });

    await expect(assign(role('Owner').id)).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(assign(role('Editor').id, 99)).rejects.toMatchObject({
      code: 'version_conflict',
    });
    await expect(
      assign(role('Editor').id, member.version, [subEvent('Sangeet').id]),
    ).resolves.toMatchObject({
      assignments: [{ roleName: 'Editor', subEventIds: [subEvent('Sangeet').id] }],
      version: member.version + 1,
    });
  });

  it("can't change someone with more permissions than you, nor the Owner", async () => {
    const { run, role, addMember, customRole, tx, event } = await wedding();
    const people = await customRole('People', ['event.view', 'members.view', 'members.manage']);
    await addMember('hr', [{ roleId: people.id, subEventIds: [] }]);
    const admin = await addMember('admin', [{ roleId: role('Admin').id, subEventIds: [] }]);
    const viewer = await addMember('viewer', [{ roleId: role('Viewer').id, subEventIds: [] }]);

    await expect(
      run('hr', removeMember, { memberId: admin.id, expectedVersion: admin.version }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    // Viewer has members.view, which HR has, but also budget.view etc., which HR lacks.
    await expect(
      run('hr', removeMember, { memberId: viewer.id, expectedVersion: viewer.version }),
    ).rejects.toMatchObject({ code: 'forbidden' });

    const owner = (await tx.members.findByUser(event.id, 'owner'))!;
    await expect(
      run('admin', removeMember, { memberId: owner.id, expectedVersion: owner.version }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      run('admin', removeMember, { memberId: viewer.id, expectedVersion: viewer.version }),
    ).resolves.toBeUndefined();
  });

  it('lets members leave, except the Owner', async () => {
    const { run, role, addMember, tx, event } = await wedding();
    await addMember('viewer', [{ roleId: role('Viewer').id, subEventIds: [] }]);
    await expect(run('owner', leaveEvent, undefined)).rejects.toMatchObject({ code: 'conflict' });
    await run('viewer', leaveEvent, undefined);
    expect(await tx.access.forUser(event.id, 'viewer')).toBeNull();
  });

  it('transfers ownership: the new owner gains Owner, the old one keeps the chosen role', async () => {
    const { run, role, addMember, tx, event, owners } = await wedding();
    const editor = await addMember('editor', [{ roleId: role('Editor').id, subEventIds: [] }]);
    await expect(
      run('editor', transferOwnership, { memberId: editor.id, keepRoleId: role('Admin').id }),
    ).rejects.toMatchObject({ code: 'forbidden' });

    await run('owner', transferOwnership, { memberId: editor.id, keepRoleId: role('Admin').id });
    expect(await tx.access.forUser(event.id, 'editor')).toMatchObject({ isOwner: true });
    const old = await tx.access.forUser(event.id, 'owner');
    expect(old).toMatchObject({ isOwner: false });
    expect(old!.wholeEvent).not.toContain('event.delete');
    expect(owners.get(event.id)).toBe('editor');
  });
});

describe('member invites', () => {
  const linkBase = 'https://app.test/join/';

  it('emails an invite through the outbox and joins the invited address only', async () => {
    const { run, role, outbox, runtime, tx, event, subEvent } = await wedding();
    const invite = (await run('owner', createMemberInvite, {
      body: {
        email: 'Rahul@Example.com',
        grants: [{ roleId: role('Helper').id, subEventIds: [subEvent('Haldi').id] }],
        maxUses: 1,
        expiresInDays: 7,
      },
      linkBase,
      inviterName: 'Priya',
    })) as { id: string; token: string; email: string };
    expect(invite.email).toBe('rahul@example.com');
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      topic: 'email.critical',
      dedupeKey: `member-invite-${invite.id}`,
      payload: {
        template: 'member-invite',
        to: 'rahul@example.com',
        eventName: 'Sharma Wedding',
        url: `${linkBase}${invite.token}`,
      },
    });

    const accept = (userId: string, userEmail: string) =>
      runAction(runtime, ctxFor(userId, null), acceptMemberInvite, {
        token: invite.token,
        userEmail,
      });
    await expect(accept('someone', 'someone@example.com')).rejects.toMatchObject({
      code: 'forbidden',
      details: { emailHint: 'ra***@example.com' },
    });
    await expect(accept('rahul', 'rahul@example.com')).resolves.toEqual({
      eventId: event.id,
      joined: true,
    });
    const rahul = await tx.access.forUser(event.id, 'rahul');
    expect(rahul?.wholeEvent).toEqual([]);
    expect(rahul?.subEvents[subEvent('Haldi').id]).toContain('tasks.update_own');
    // Single use.
    await expect(accept('other', 'rahul@example.com')).rejects.toMatchObject({
      code: 'link_expired',
    });
  });

  it('shareable links: several uses, already-members change nothing, revoke ends it', async () => {
    const { run, role, runtime, invites } = await wedding();
    const invite = (await run('owner', createMemberInvite, {
      body: {
        grants: [{ roleId: role('Viewer').id, subEventIds: [] }],
        maxUses: 5,
        expiresInDays: 7,
      },
      linkBase,
      inviterName: 'Priya',
    })) as { id: string; token: string };
    const accept = (userId: string) =>
      runAction(runtime, ctxFor(userId, null), acceptMemberInvite, {
        token: invite.token,
        userEmail: `${userId}@example.com`,
      });

    await expect(accept('a')).resolves.toMatchObject({ joined: true });
    await expect(accept('a')).resolves.toMatchObject({ joined: false });
    await expect(accept('owner')).resolves.toMatchObject({ joined: false });
    expect(invites.get(invite.id)!.usedCount).toBe(1);

    await run('owner', revokeMemberInvite, { inviteId: invite.id });
    await expect(accept('b')).rejects.toMatchObject({ code: 'link_revoked' });
    await expect(
      runAction(runtime, ctxFor('b', null), acceptMemberInvite, {
        token: 'not-a-token',
        userEmail: 'b@example.com',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it("can't offer roles beyond the inviter's own, and re-checks the inviter on accept", async () => {
    const { run, role, runtime, addMember, customRole } = await wedding();
    const people = await customRole('People', ['event.view', 'members.manage']);
    const hr = await addMember('hr', [{ roleId: people.id, subEventIds: [] }]);
    await expect(
      run('hr', createMemberInvite, {
        body: {
          grants: [{ roleId: role('Admin').id, subEventIds: [] }],
          maxUses: 1,
          expiresInDays: 7,
        },
        linkBase,
        inviterName: 'HR',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });

    const invite = (await run('hr', createMemberInvite, {
      body: { grants: [{ roleId: people.id, subEventIds: [] }], maxUses: 1, expiresInDays: 7 },
      linkBase,
      inviterName: 'HR',
    })) as { token: string };
    await run('owner', removeMember, { memberId: hr.id, expectedVersion: hr.version });
    await expect(
      runAction(runtime, ctxFor('new', null), acceptMemberInvite, {
        token: invite.token,
        userEmail: 'new@example.com',
      }),
    ).rejects.toMatchObject({ code: 'link_revoked' });
  });
});
