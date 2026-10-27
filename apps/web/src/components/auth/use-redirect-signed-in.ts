'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { needsWelcome, useMe } from '@/lib/me';

/** Where a signed-in user belongs: Welcome until they have a name, then the app. */
export function destinationFor(me: Parameters<typeof needsWelcome>[0]) {
  return needsWelcome(me) ? '/welcome' : '/app';
}

/** Sends someone who is already signed in away from the sign-in page. */
export function useRedirectSignedIn(enabled: boolean) {
  const router = useRouter();
  const { data: me } = useMe();
  useEffect(() => {
    if (enabled && me) router.replace(destinationFor(me));
  }, [enabled, me, router]);
}
