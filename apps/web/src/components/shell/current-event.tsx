'use client';

import { createContext, use, useState, type ReactNode } from 'react';

import { PREVIEW_EVENTS, type PreviewEvent } from './preview-events';

interface CurrentEventContext {
  event: PreviewEvent;
  events: PreviewEvent[];
  setEventId: (id: string) => void;
}

const Context = createContext<CurrentEventContext | null>(null);

/** The event the shell shows. Milestone 3 replaces this with the event id in the URL. */
export function CurrentEventProvider({ children }: { children: ReactNode }) {
  const [eventId, setEventId] = useState(PREVIEW_EVENTS[0]!.id);
  const event = PREVIEW_EVENTS.find((candidate) => candidate.id === eventId) ?? PREVIEW_EVENTS[0]!;
  return <Context value={{ event, events: PREVIEW_EVENTS, setEventId }}>{children}</Context>;
}

export function useCurrentEvent(): CurrentEventContext {
  const value = use(Context);
  if (!value) {
    throw new Error('useCurrentEvent must be used inside CurrentEventProvider');
  }
  return value;
}
