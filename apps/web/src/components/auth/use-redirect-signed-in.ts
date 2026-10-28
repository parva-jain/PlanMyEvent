'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { needsWelcome, useMe } from '@/lib/me';
import { currentReturnTo, withReturnTo } from '@/lib/return-to';

/**
 * Where a signed-in user belongs: Welcome until they have a name, then the page they came
 * from (`?next=`, e.g. a join link) or My events.
 */
export function destinationFor(me: Parameters<typeof needsWelcome>[0]) {
  const next = currentReturnTo();
  return needsWelcome(me) ? withReturnTo('/welcome', next) : (next ?? '/app');
}

/** Sends someone who is already signed in away from the sign-in page. */
export function useRedirectSignedIn(enabled: boolean) {
  const router = useRouter();
  const { data: me } = useMe();
  useEffect(() => {
    if (enabled && me) router.replace(destinationFor(me));
  }, [enabled, me, router]);
}
