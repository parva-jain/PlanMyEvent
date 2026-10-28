import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { SignInFlow } from '@/components/auth/sign-in-flow';
import { JoinHint } from '@/components/team/join';
import { safeReturnTo } from '@/lib/return-to';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signIn');
  return { title: t('metaTitle') };
}

const JOIN = /^\/join\/([A-Za-z0-9_-]+)$/;

/** Coming from a join link (`?next=/join/…`), the invite is named above the form. */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeReturnTo((await searchParams).next);
  const token = next?.match(JOIN)?.[1];
  return (
    <>
      {token && <JoinHint token={token} />}
      <SignInFlow />
    </>
  );
}
