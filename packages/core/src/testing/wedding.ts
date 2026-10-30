import type { Grant } from '@pme/contracts';

import { runAction, type ActionDefinition } from '../action.js';
import type { ActionContext } from '../context.js';
import { createEvent } from '../events/event-actions.js';
import type { CoreTx } from '../ports.js';
import { memoryRuntime } from './memory-tx.js';

export const ctxFor = (
  userId: string,
  eventId: string | null,
  requestId = 'req_test',
): ActionContext => ({
  requestId,
  channel: 'app',
  actor: { kind: 'user', userId, memberId: null },
  eventId,
  now: new Date('2026-10-30T00:00:00Z'),
});

/**
 * Priya's wedding in the memory runtime, with lookups and a `run` that acts as a given user
 * (request id `req_<userId>`). Members are added directly, the way an accepted invite would.
 */
export async function testWedding() {
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
  const role = (name: string) => [...memory.roles.values()].find((item) => item.name === name)!;
  const subEvent = (name: string) =>
    [...memory.subEvents.values()].find((item) => item.name === name)!;
  const run = <I, R>(userId: string, action: ActionDefinition<I, R, CoreTx>, input: I) =>
    runAction(memory.runtime, ctxFor(userId, event.id, `req_${userId}`), action, input);
  const addMember = async (userId: string, grants: Grant[]) => {
    const member = await memory.tx.members.join(event.id, userId, 'owner');
    await memory.tx.members.replaceAssignments(event.id, member.id, grants, 'owner');
    return (await memory.tx.members.find(event.id, member.id))!;
  };
  return { ...memory, event, role, subEvent, run, addMember };
}
