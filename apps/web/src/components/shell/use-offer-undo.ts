'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useSnackbar } from '@/components/motion/undo-snackbar';
import { undoRequest } from '@/lib/activity';

import { useCurrentEvent } from './current-event';

/**
 * After a delete: "Haldi deleted · Undo" for 5 s (MOTION.md 6.12). Undo finds the delete in
 * the activity log, so it's offered only to those who can read it.
 */
export function useOfferUndo() {
  const { eventId, can } = useCurrentEvent();
  const show = useSnackbar();
  const queryClient = useQueryClient();
  return (message: ReactNode, entityId: string, requestId: string) =>
    show({
      message,
      ...(can('activity.view') && {
        onUndo: () => undoRequest(queryClient, eventId, { requestId, entityId }),
      }),
    });
}
