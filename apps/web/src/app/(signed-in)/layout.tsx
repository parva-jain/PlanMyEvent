import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { SessionGate } from '@/components/auth/session-gate';
import { SnackbarProvider } from '@/components/motion/undo-snackbar';
import { QueryProvider } from '@/components/query-provider';

// Signed-in area: never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Everything behind sign-in: My events, the create wizard and each event's shell. */
export default function SignedInLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <SnackbarProvider>
        <SessionGate>{children}</SessionGate>
      </SnackbarProvider>
    </QueryProvider>
  );
}
