'use client';

import type { EntityOp } from '@pme/contracts';
import { useSyncExternalStore } from 'react';

/** A recent change to one entity, for its row's LiveHighlight (MOTION.md 6.12). */
export interface Highlight {
  /** New for every change, so the glow plays again. */
  key: number;
  /** `others` for a live signal, `own` after this tab's undo. */
  source: 'others' | 'own';
  op: EntityOp;
  actorUserId: string | null;
}

/** Longer than the longest glow (1.5 s), so a row that mounts late still gets it. */
const KEEP_MS = 2_000;

const highlights = new Map<string, Highlight>();
const listeners = new Set<() => void>();
let counter = 0;

const notify = () => {
  for (const listener of listeners) listener();
};

/** Marks an entity as just changed; rows showing it glow. */
export function highlight(entityId: string, change: Omit<Highlight, 'key'>): void {
  const key = ++counter;
  highlights.set(entityId, { ...change, key });
  notify();
  setTimeout(() => {
    if (highlights.get(entityId)?.key !== key) return;
    highlights.delete(entityId);
    notify();
  }, KEEP_MS);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The entity's latest change while it's fresh, else null. */
export function useHighlight(entityId: string): Highlight | null {
  return useSyncExternalStore(
    subscribe,
    () => highlights.get(entityId) ?? null,
    () => null,
  );
}
