import { LIVE_TOPIC, type LiveSignal } from '@pme/contracts';
import { describe, expect, it } from 'vitest';

import { deleteSubEvent, updateSubEvent } from './events/program-actions.js';
import { removeMember } from './team/member-actions.js';
import { updateRole } from './team/role-actions.js';
import { testWedding } from './testing/wedding.js';

async function wedding() {
  const wedding = await testWedding();
  /** Live signals written since the last call. */
  let seen = wedding.outbox.length;
  const signals = () => {
    const fresh = wedding.outbox.slice(seen).filter((message) => message.topic === LIVE_TOPIC);
    seen = wedding.outbox.length;
    return fresh.map((message) => message.payload as LiveSignal);
  };
  return { ...wedding, signals };
}

describe('live signals', () => {
  it('every logged change sends entity.changed to the event room, from the outbox', async () => {
    const { run, subEvent, signals, event } = await wedding();
    signals();
    const haldi = subEvent('Haldi');
    await run('owner', updateSubEvent, {
      subEventId: haldi.id,
      expectedVersion: 1,
      changes: { capacity: 80 },
    });
    expect(signals()).toEqual([
      {
        kind: 'emit',
        room: `event:${event.id}`,
        event: 'entity.changed',
        data: {
          eventId: event.id,
          entityType: 'sub_event',
          entityId: haldi.id,
          op: 'updated',
          version: 2,
          subEventId: haldi.id,
          actorUserId: 'owner',
          requestId: 'req_owner',
        },
      },
    ]);
  });

  it('a removed member leaves the room and is told; everyone re-checks that member', async () => {
    const { run, role, addMember, signals, event } = await wedding();
    const rahul = await addMember('rahul', [{ roleId: role('Viewer').id, subEventIds: [] }]);
    signals();
    await run('owner', removeMember, { memberId: rahul.id, expectedVersion: rahul.version });

    const sent = signals();
    expect(sent[0]).toMatchObject({ event: 'entity.changed', data: { op: 'deleted' } });
    expect(sent.slice(1)).toEqual([
      { kind: 'leave', userId: 'rahul', eventId: event.id },
      { kind: 'emit', room: 'user:rahul', event: 'member.removed', data: { eventId: event.id } },
      {
        kind: 'emit',
        room: `event:${event.id}`,
        event: 'permissions.changed',
        data: { eventId: event.id, memberId: rahul.id },
      },
    ]);
  });

  it('a role change or dropped sub-event scopes make everyone re-check (memberId null)', async () => {
    const { run, role, addMember, subEvent, signals, event } = await wedding();
    const editor = role('Editor');
    await run('owner', updateRole, {
      roleId: editor.id,
      expectedVersion: 1,
      changes: { name: 'Planner' },
    });
    const permissions = (list: LiveSignal[]) =>
      list.filter((item) => item.kind === 'emit' && item.event === 'permissions.changed');
    expect(permissions(signals())).toEqual([
      expect.objectContaining({ data: { eventId: event.id, memberId: null } }),
    ]);

    const mehendi = subEvent('Mehendi');
    await addMember('helper', [{ roleId: role('Helper').id, subEventIds: [mehendi.id] }]);
    signals();
    await run('owner', deleteSubEvent, { subEventId: mehendi.id, expectedVersion: 1 });
    expect(permissions(signals())).toHaveLength(1);
  });
});
