'use client';

import type { MemberInvitePreview } from '@pme/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Clock, Link2Off, PartyPopper } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { FullPageLoading } from '@/components/auth/full-page-loading';
import { useConfetti } from '@/components/motion/confetti';
import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { ACCENT } from '@/components/shell/accents';
import { eventHref, MY_EVENTS_HREF } from '@/components/shell/nav';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { authClient, callAuth } from '@/lib/auth-client';
import { formatEventDate, formatEventRange } from '@/lib/format';
import { needsWelcome, useMe } from '@/lib/me';
import { distance, duration, ease, spring } from '@/lib/motion';
import { withReturnTo } from '@/lib/return-to';
import { useAcceptInvite, useInvitePreview } from '@/lib/team';
import { cn } from '@/lib/utils';

type Dead = 'invalid' | 'expired' | 'revoked';

function deadReason(error: unknown): Dead | null {
  if (!(error instanceof ApiError)) return null;
  if (error.problem?.code === 'link_expired') return 'expired';
  if (error.problem?.code === 'link_revoked') return 'revoked';
  return error.status === 404 ? 'invalid' : null;
}

/** The invite card's top: event, who invited you, and what you'll be. */
function InviteSummary({ preview }: { preview: MemberInvitePreview }) {
  const t = useTranslations('join');
  const tTypes = useTranslations('app.eventTypes');
  const accent = ACCENT[preview.event.type];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-3 py-0.5 text-small', accent.tint, accent.text)}>
          {tTypes(preview.event.type)}
        </span>
        <span className="flex items-center gap-1 text-small text-fg-secondary">
          <CalendarDays aria-hidden className="size-4" />
          {formatEventRange(preview.event.startsOn, preview.event.endsOn)}
        </span>
      </div>
      <h1 className="text-h2">
        {t('title', { name: preview.invitedBy.name, event: preview.event.name })}
      </h1>
      <ul className="flex flex-wrap gap-2" aria-label={t('rolesLabel')}>
        {preview.roles.map((role) => (
          <li
            key={role.name}
            className="rounded-full bg-success-tint px-3 py-1 text-small text-success-text"
          >
            {role.subEvents.length ? `${role.name} · ${role.subEvents.join(', ')}` : role.name}
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-1.5 text-small text-fg-muted">
        <Clock aria-hidden className="size-4" />
        {t('expires', { date: formatEventDate(preview.expiresAt.slice(0, 10)) })}
      </p>
    </div>
  );
}

/**
 * The join link (Stitch "Accept team invite"). Anyone can see what it offers; joining needs
 * sign-in, which comes back here afterwards. Success scales in "You're in" with a confetti
 * burst in the event's accent (MOTION.md 6.10); dead links get a static card.
 */
export function Join({ token }: { token: string }) {
  const t = useTranslations('join');
  const router = useRouter();
  const queryClient = useQueryClient();
  const reduced = useShouldReduceMotion();
  const fireConfetti = useConfetti();
  const preview = useInvitePreview(token);
  const { data: me, isPending: mePending } = useMe();
  const accept = useAcceptInvite(token);
  const [result, setResult] = useState<{ eventId: string; joined: boolean } | null>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const here = `/join/${token}`;

  useEffect(() => {
    if (me && needsWelcome(me)) router.replace(withReturnTo('/welcome', here));
  }, [me, router, here]);

  useEffect(() => {
    if (result?.joined && successRef.current) {
      void fireConfetti({ origin: successRef.current });
    }
  }, [result, fireConfetti]);

  const dead = deadReason(preview.error) ?? deadReason(accept.error);
  const wrongEmail =
    accept.error instanceof ApiError && accept.error.status === 403
      ? ((accept.error.problem as { emailHint?: string } | null)?.emailHint ?? '')
      : null;

  async function switchAccount() {
    await callAuth(() => authClient.signOut());
    queryClient.clear();
    router.replace(withReturnTo('/sign-in', here));
  }

  if (preview.isPending) return <FullPageLoading />;

  if (dead || preview.isError) {
    return (
      <section role="alert" className="flex flex-col gap-4">
        <span className="flex size-12 items-center justify-center rounded-full bg-surface-muted">
          <Link2Off aria-hidden className="size-6 text-fg-secondary" />
        </span>
        <h1 className="text-h2">{t(`dead.${dead ?? 'invalid'}.title`)}</h1>
        <p className="text-body text-fg-secondary">{t(`dead.${dead ?? 'invalid'}.body`)}</p>
        <Button asChild variant="secondary" className="self-start">
          <Link href={me ? MY_EVENTS_HREF : '/'}>{me ? t('toMyEvents') : t('toHome')}</Link>
        </Button>
      </section>
    );
  }

  const invite = preview.data;
  if (!invite) return null;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {result ? (
        <m.section
          key="done"
          ref={successRef}
          role="status"
          className="flex flex-col gap-4"
          initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduced ? { duration: duration.fast } : spring.gentle}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-success-tint">
            <PartyPopper aria-hidden className="size-6 text-success-text" />
          </span>
          <h1 className="text-h2">{result.joined ? t('joinedTitle') : t('alreadyTitle')}</h1>
          <p className="text-body text-fg-secondary">
            {result.joined
              ? t('joinedBody', { event: invite.event.name })
              : t('alreadyBody', { event: invite.event.name })}
          </p>
          <Button asChild icon={<ArrowRight aria-hidden />} className="self-start">
            <Link href={eventHref(result.eventId)}>{t('openEvent')}</Link>
          </Button>
        </m.section>
      ) : (
        <m.section
          key="invite"
          className="flex flex-col gap-6"
          initial={{ opacity: 0, y: reduced ? 0 : distance.rise }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: duration.fast, ease: ease.in } }}
          transition={reduced ? { duration: duration.fast } : spring.gentle}
        >
          <InviteSummary preview={invite} />
          {invite.emailHint && (
            <p className="text-small text-fg-secondary">
              {t('emailOnly', { email: invite.emailHint })}
            </p>
          )}

          {wrongEmail !== null && (
            <p
              role="alert"
              className="rounded-control bg-warning-tint px-4 py-3 text-small text-warning-text"
            >
              {t('wrongEmail', { email: wrongEmail })}
            </p>
          )}
          {accept.isError && wrongEmail === null && !dead && (
            <p role="alert" className="text-small text-danger-text">
              {t('failed')}
            </p>
          )}

          {mePending ? (
            <FullPageLoading />
          ) : me ? (
            <div className="flex flex-col gap-3">
              <Button
                icon={<ArrowRight aria-hidden />}
                loading={accept.isPending}
                onClick={() => accept.mutate(undefined, { onSuccess: setResult })}
              >
                {t('join')}
              </Button>
              <p className="text-small text-fg-secondary">
                {t('signedInAs', { email: me.user.email })}{' '}
                <button
                  type="button"
                  onClick={() => void switchAccount()}
                  className="rounded-control text-primary-text underline underline-offset-2"
                >
                  {t('switchAccount')}
                </button>
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Button asChild icon={<ArrowRight aria-hidden />}>
                <Link href={withReturnTo('/sign-in', here)}>{t('signInToJoin')}</Link>
              </Button>
              <p className="text-small text-fg-secondary">{t('signInHint')}</p>
            </div>
          )}
        </m.section>
      )}
    </AnimatePresence>
  );
}

/**
 * Sign-in opened from a join link (Stitch "Team invite sign-in"): a small card naming the
 * event slides in first (MOTION.md 6.3, `gentle`), so people know why they're signing in.
 */
export function JoinHint({ token }: { token: string }) {
  const t = useTranslations('join');
  const reduced = useShouldReduceMotion();
  const { data: preview } = useInvitePreview(token);
  if (!preview) return null;
  return (
    <m.p
      className="mb-6 rounded-card border border-border bg-surface p-4 text-small shadow-card"
      initial={{ opacity: 0, y: reduced ? 0 : -distance.rise }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: duration.fast } : spring.gentle}
    >
      {t('hint', { name: preview.invitedBy.name, event: preview.event.name })}
    </m.p>
  );
}
