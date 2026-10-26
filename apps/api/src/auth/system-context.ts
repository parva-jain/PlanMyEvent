import type { ActionContext } from '@pme/core';

/** Context for actions the auth flow runs on the system's behalf, outside any request user. */
export function authSystemContext(): ActionContext {
  return {
    requestId: 'auth',
    channel: 'system',
    actor: { kind: 'system', name: 'auth' },
    eventId: null,
    now: new Date(),
  };
}
