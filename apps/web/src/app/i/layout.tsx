import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { QueryProvider } from '@/components/query-provider';

/**
 * Guests' invitation pages. The link's token is in the URL, so they're never indexed and
 * never send it on as a referrer (to maps, or anywhere else a guest taps through to).
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function InviteLayout({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
