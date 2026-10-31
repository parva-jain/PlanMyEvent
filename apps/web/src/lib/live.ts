'use client';

import {
  LIVE_NAMESPACE,
  type ClientToServerEvents,
  type EntityChanged,
  type JobProgress,
  type MemberRemoved,
  type PermissionsChanged,
  type ServerToClientEvents,
} from '@pme/contracts';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import { invalidateEntity } from './activity';
import { API_URL, isOwnRequest } from './api';
import { eventKeys } from './events';
import { highlight } from './live-highlights';
import { peopleKeys } from './people';

type LiveSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * If the socket can't connect for this long, poll what's on screen at the same pace until it
 * recovers (APIDesign "Fallback"). A refused socket (signed out, too many tabs) tries again
 * after the same wait, since Socket.io doesn't retry those by itself.
 */
export const FALLBACK_MS = 30_000;

const CLOSE_AFTER_MS = 1_000;

/** One socket per tab, shared by every event screen; how many screens use each event room. */
let socket: LiveSocket | null = null;
const rooms = new Map<string, number>();

const join = (live: LiveSocket, eventId: string) =>
  // A refused join (no longer a member) needs nothing here: REST answers 404 the same way.
  live.emit('event:join', { eventId }, () => undefined);

function openSocket(): LiveSocket {
  if (socket) return socket;
  // The session cookie belongs to the API's host; the API checks the Origin header.
  const live: LiveSocket = io(`${API_URL}${LIVE_NAMESPACE}`, {
    transports: ['websocket'],
    withCredentials: true,
  });
  // Rooms don't survive a reconnect: join again every time.
  live.on('connect', () => {
    for (const eventId of rooms.keys()) join(live, eventId);
  });
  live.on('connect_error', () => {
    if (!live.active) setTimeout(() => socket === live && live.connect(), FALLBACK_MS);
  });
  socket = live;
  return live;
}

function enterRoom(eventId: string): LiveSocket {
  const live = openSocket();
  const count = rooms.get(eventId) ?? 0;
  rooms.set(eventId, count + 1);
  if (count === 0 && live.connected) join(live, eventId);
  return live;
}

function leaveRoom(live: LiveSocket, eventId: string) {
  const count = (rooms.get(eventId) ?? 1) - 1;
  if (count > 0) return void rooms.set(eventId, count);
  rooms.delete(eventId);
  live.emit('event:leave', { eventId }, () => undefined);
  // Close once no screen needs it; the wait keeps it open while switching events.
  setTimeout(() => {
    if (rooms.size > 0 || socket !== live) return;
    live.disconnect();
    socket = null;
  }, CLOSE_AFTER_MS);
}

/** The highest version of this entity any cached query holds, or -1. */
function heldVersion(queryClient: QueryClient, eventId: string, entityId: string): number {
  let held = -1;
  for (const [, data] of queryClient.getQueriesData({ queryKey: eventKeys.event(eventId) })) {
    for (const item of Array.isArray(data) ? data : [data]) {
      const { id, version } = (item ?? {}) as { id?: unknown; version?: unknown };
      if (id === entityId && typeof version === 'number') held = Math.max(held, version);
    }
  }
  return held;
}

/**
 * Keeps one event's screens live (APIDesign "Real-time contract"): joins its room, and on
 * each signal invalidates what changed so on-screen queries re-fetch through REST. Skips
 * signals for this tab's own requests and for versions it already holds. Returns true once
 * I've been removed from the event.
 */
export function useLiveEvent(eventId: string, myMemberId: string | undefined): boolean {
  const queryClient = useQueryClient();
  const memberId = useRef(myMemberId);
  const [removed, setRemoved] = useState(false);
  useEffect(() => {
    memberId.current = myMemberId;
  }, [myMemberId]);

  useEffect(() => {
    const live = enterRoom(eventId);
    // Everything on screen for this event; inactive queries just go stale.
    const refetchOnScreen = () =>
      void queryClient.invalidateQueries({ queryKey: eventKeys.event(eventId) });
    let poller: ReturnType<typeof setInterval> | undefined;
    // Whether signals may have been missed: not on the first connect, data was just fetched.
    let missed = false;
    const waiting = () => {
      poller ??= setInterval(refetchOnScreen, FALLBACK_MS);
    };
    const lost = () => {
      missed = true;
      waiting();
    };
    const connected = () => {
      clearInterval(poller);
      poller = undefined;
      // Signals aren't stored: after a gap, re-fetch instead of replaying.
      if (missed) refetchOnScreen();
      missed = false;
    };
    if (!live.connected) waiting();

    const changed = (signal: EntityChanged) => {
      if (signal.eventId !== eventId || isOwnRequest(signal.requestId)) return;
      const stale =
        signal.version !== null &&
        heldVersion(queryClient, eventId, signal.entityId) >= signal.version;
      if (stale) return;
      invalidateEntity(queryClient, eventId, signal.entityType);
      if (signal.op !== 'deleted') {
        highlight(signal.entityId, {
          source: 'others',
          op: signal.op,
          actorUserId: signal.actorUserId,
        });
      }
    };
    const permissions = (signal: PermissionsChanged) => {
      if (signal.eventId !== eventId) return;
      // My access changed, so what every list shows may have too.
      if (signal.memberId === null || signal.memberId === memberId.current) refetchOnScreen();
    };
    const memberRemoved = (signal: MemberRemoved) => {
      if (signal.eventId !== eventId) return;
      setRemoved(true);
      void queryClient.invalidateQueries({ queryKey: eventKeys.mine });
    };

    // A job I started moved on: re-read its status (the signal itself is only a nudge).
    const progress = (signal: JobProgress) => {
      if (signal.eventId !== eventId) return;
      void queryClient.invalidateQueries({ queryKey: peopleKeys.job(eventId, signal.jobId) });
    };

    live.on('connect', connected);
    live.on('disconnect', lost);
    live.on('connect_error', lost);
    live.on('entity.changed', changed);
    live.on('permissions.changed', permissions);
    live.on('member.removed', memberRemoved);
    live.on('job.progress', progress);
    return () => {
      clearInterval(poller);
      live.off('connect', connected);
      live.off('disconnect', lost);
      live.off('connect_error', lost);
      live.off('entity.changed', changed);
      live.off('permissions.changed', permissions);
      live.off('member.removed', memberRemoved);
      live.off('job.progress', progress);
      leaveRoom(live, eventId);
    };
  }, [eventId, queryClient]);

  return removed;
}
