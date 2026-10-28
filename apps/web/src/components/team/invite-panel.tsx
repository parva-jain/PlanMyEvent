'use client';

import type { CreatedMemberInvite, Grant } from '@pme/contracts';
import { Check, Copy, Link2, Mail, Send } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';

import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { useCurrentEvent } from '@/components/shell/current-event';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError } from '@/lib/api';
import { useSubEvents } from '@/lib/events';
import { duration } from '@/lib/motion';
import { joinUrl, useCreateInvite, useRoles } from '@/lib/team';

import { assignableRoles, canGrant, GrantPicker, selectClass } from './grant-picker';

const EXPIRY_DAYS = [1, 7, 14, 30] as const;

/** The best default: Helper if I can give it, otherwise the first role I can give. */
function useDefaultGrant(): Grant | null {
  const { eventId, membership } = useCurrentEvent();
  const { data: roles } = useRoles(eventId);
  if (!roles) return null;
  const grantable = assignableRoles(roles).filter((role) =>
    canGrant(membership.permissions, role, []),
  );
  const role = grantable.find((item) => item.isStandard && item.name === 'Helper') ?? grantable[0];
  return role ? { roleId: role.id, subEventIds: [] } : null;
}

/**
 * Invite people (Stitch "Invite people"): by email, which sends a single-use link, or a
 * shareable link for WhatsApp with a number of joins. The link token is shown once.
 */
export function InvitePanelBody({ onDone }: { onDone: () => void }) {
  const t = useTranslations('team.invite');
  const fallback = useDefaultGrant();
  if (!fallback) return <p className="text-body text-fg-secondary">{t('noRoles')}</p>;
  return <InviteForms initial={fallback} onDone={onDone} />;
}

function InviteForms({ initial, onDone }: { initial: Grant; onDone: () => void }) {
  const t = useTranslations('team.invite');
  const { eventId, membership } = useCurrentEvent();
  const { data: roles = [] } = useRoles(eventId);
  const { data: subEvents = [] } = useSubEvents(eventId);
  const create = useCreateInvite(eventId);

  const [grant, setGrant] = useState<Grant>(initial);
  const [email, setEmail] = useState('');
  const [maxUses, setMaxUses] = useState(10);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedMemberInvite | null>(null);
  const [error, setError] = useState<string | null>(null);

  const failure = (failed: unknown) => {
    const field = failed instanceof ApiError ? failed.problem?.fields?.[0]?.message : undefined;
    const forbidden = failed instanceof ApiError && failed.status === 403;
    setError(field ?? (forbidden ? t('beyondYours') : t('failed')));
  };

  function sendEmail(formEvent: FormEvent) {
    formEvent.preventDefault();
    setError(null);
    setSentTo(null);
    create.mutate(
      { email: email.trim(), grants: [grant], maxUses: 1, expiresInDays },
      {
        onSuccess: (invite) => {
          setSentTo(invite.email);
          setEmail('');
        },
        onError: failure,
      },
    );
  }

  function makeLink() {
    setError(null);
    create.mutate(
      { grants: [grant], maxUses, expiresInDays },
      { onSuccess: setCreated, onError: failure },
    );
  }

  const picker = (
    <GrantPicker
      value={grant}
      onChange={(next) => {
        setGrant(next);
        setCreated(null);
      }}
      roles={roles}
      subEvents={subEvents}
      mine={membership.permissions}
    />
  );
  const expiry = (
    <Field id="invite-expiry" label={t('expires')}>
      <select
        id="invite-expiry"
        className={selectClass}
        value={expiresInDays}
        onChange={(e) => {
          setExpiresInDays(Number(e.target.value));
          setCreated(null);
        }}
      >
        {EXPIRY_DAYS.map((days) => (
          <option key={days} value={days}>
            {t('inDays', { days })}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <Tabs defaultValue="email" onValueChange={() => setError(null)}>
      <TabsList aria-label={t('how')} className="self-start">
        <TabsTrigger value="email">
          <Mail aria-hidden className="size-4" />
          {t('byEmail')}
        </TabsTrigger>
        <TabsTrigger value="link">
          <Link2 aria-hidden className="size-4" />
          {t('byLink')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="email">
        <form onSubmit={sendEmail} className="flex flex-col gap-5">
          <Field id="invite-email" label={t('email')} hint={t('emailHint')}>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {picker}
          {expiry}
          {sentTo && (
            <p
              role="status"
              className="rounded-control bg-success-tint px-4 py-3 text-small text-success-text"
            >
              {t('sent', { email: sentTo })}
            </p>
          )}
          {error && (
            <p role="alert" className="text-small text-danger-text">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <Button type="submit" icon={<Send aria-hidden />} loading={create.isPending}>
              {t('send')}
            </Button>
            <Button type="button" variant="secondary" onClick={onDone}>
              {t('done')}
            </Button>
          </div>
        </form>
      </TabsContent>

      <TabsContent value="link">
        <div className="flex flex-col gap-5">
          {picker}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="invite-uses" label={t('maxUses')}>
              <Input
                id="invite-uses"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={maxUses}
                onChange={(e) => {
                  setMaxUses(Math.min(100, Math.max(1, Number(e.target.value) || 1)));
                  setCreated(null);
                }}
              />
            </Field>
            {expiry}
          </div>
          {created ? (
            <ShareLink invite={created} />
          ) : (
            <Button
              type="button"
              icon={<Link2 aria-hidden />}
              loading={create.isPending}
              onClick={makeLink}
              className="self-start"
            >
              {t('createLink')}
            </Button>
          )}
          {error && (
            <p role="alert" className="text-small text-danger-text">
              {error}
            </p>
          )}
          <p className="text-small text-fg-muted">{t('revokeNote')}</p>
        </div>
      </TabsContent>
    </Tabs>
  );
}

/** The new link, once: copy it or send it on WhatsApp. Copying crossfades to "Copied". */
function ShareLink({ invite }: { invite: CreatedMemberInvite }) {
  const t = useTranslations('team.invite');
  const { event } = useCurrentEvent();
  const reduced = useShouldReduceMotion();
  const url = joinUrl(invite.token);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(t('whatsappText', { event: event.name, url }))}`;

  return (
    <div className="flex flex-col gap-3 rounded-control bg-surface-muted p-3">
      <label htmlFor="invite-link" className="text-label">
        {t('linkReady')}
      </label>
      <Input id="invite-link" readOnly value={url} onFocus={(e) => e.target.select()} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => void navigator.clipboard?.writeText(url).then(() => setCopied(true))}
          icon={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        >
          <AnimatePresence mode="wait" initial={false}>
            <m.span
              key={copied ? 'copied' : 'copy'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? duration.instant : duration.fast }}
            >
              {copied ? t('copied') : t('copy')}
            </m.span>
          </AnimatePresence>
        </Button>
        <Button asChild variant="secondary">
          <a href={whatsapp} target="_blank" rel="noreferrer">
            {t('whatsapp')}
          </a>
        </Button>
      </div>
      <p className="text-small text-fg-secondary">{t('onceNote')}</p>
    </div>
  );
}
