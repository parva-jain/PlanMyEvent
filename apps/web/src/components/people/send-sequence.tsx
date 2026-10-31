'use client';

import type { Invitation, InvitationShare } from '@pme/contracts';
import { MessageCircle, SkipForward } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { CheckDraw } from '@/components/motion/check-draw';
import { CountUp } from '@/components/motion/count-up';
import { Dialog } from '@/components/motion/dialog';
import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { ProgressFill } from '@/components/motion/progress-fill';
import { useCurrentEvent } from '@/components/shell/current-event';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { distance, duration, ease } from '@/lib/motion';
import { useUpdateInvitation } from '@/lib/people';

/**
 * Sends invitations on WhatsApp one by one (Stitch "Send invitations, 12 of 60"): open the
 * chat with the message ready, and coming back to this tab marks it sent and slides the
 * next guest in from the right (MOTION.md 6.15, `moderate`).
 */
export function SendSequence({
  invitations,
  onClose,
}: {
  invitations: Invitation[] | null;
  onClose: () => void;
}) {
  const t = useTranslations('people.send');
  return (
    <Dialog
      open={invitations !== null && invitations.length > 0}
      onOpenChange={(open) => !open && onClose()}
      title={t('title')}
      description={t('description')}
    >
      {invitations && invitations.length > 0 && (
        <Sequence
          key={invitations.map((item) => item.id).join()}
          invitations={invitations}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function Sequence({ invitations, onClose }: { invitations: Invitation[]; onClose: () => void }) {
  const t = useTranslations('people.send');
  const { eventId } = useCurrentEvent();
  const reduced = useShouldReduceMotion();
  const update = useUpdateInvitation(eventId);
  const [index, setIndex] = useState(0);
  const [sent, setSent] = useState(0);
  const [justSent, setJustSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const opened = useRef<Invitation | null>(null);
  const current = invitations[index];
  const finished = index >= invitations.length;

  // Back from WhatsApp: mark it sent, show the check, then the next guest.
  useEffect(() => {
    const back = () => {
      if (document.visibilityState !== 'visible' || !opened.current) return;
      const invitation = opened.current;
      opened.current = null;
      update.mutate({ invitation, changes: { deliveryStatus: 'sent_digitally' } });
      setSent((count) => count + 1);
      setJustSent(true);
      setTimeout(
        () => {
          setJustSent(false);
          setIndex((at) => at + 1);
        },
        reduced ? 0 : 600,
      );
    };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [update, reduced]);

  async function open() {
    if (!current) return;
    setFailed(false);
    const tab = window.open('', '_blank');
    try {
      const share = await apiFetch<InvitationShare>(
        `/v1/events/${eventId}/invitations/${current.id}/share`,
      );
      opened.current = current;
      if (tab) tab.location.href = share.whatsappUrl;
      else window.location.href = share.whatsappUrl;
    } catch {
      tab?.close();
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-5" data-testid="send-sequence">
      <div className="flex items-center gap-3">
        <ProgressFill
          value={(sent / invitations.length) * 100}
          label={t('progressLabel')}
          className="flex-1"
        />
        <span className="text-small tabular-nums text-fg-secondary">
          <CountUp value={sent} /> {t('of', { total: invitations.length })}
        </span>
      </div>
      <div className="relative min-h-24 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          {finished ? (
            <m.p
              key="done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-body"
              role="status"
            >
              {t('done', { count: sent })}
            </m.p>
          ) : (
            <m.div
              key={current!.id}
              initial={{ x: reduced ? 0 : distance.riseLarge * 2, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: reduced ? 0 : -distance.riseLarge * 2, opacity: 0 }}
              transition={{ duration: reduced ? duration.fast : duration.moderate, ease: ease.out }}
              className="flex items-center gap-3 rounded-control bg-surface-muted p-4"
            >
              <span className="flex-1 text-h3">{current!.guestName}</span>
              {justSent && <CheckDraw checked size={24} className="text-success" />}
            </m.div>
          )}
        </AnimatePresence>
      </div>
      {failed && (
        <p role="alert" className="text-small text-danger-text">
          {t('failed')}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {finished ? (
          <Button onClick={onClose}>{t('close')}</Button>
        ) : (
          <>
            <Button
              variant="secondary"
              icon={<SkipForward aria-hidden />}
              onClick={() => setIndex(index + 1)}
            >
              {t('skip')}
            </Button>
            <Button icon={<MessageCircle aria-hidden />} onClick={() => void open()}>
              {t('open')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
