'use client';

import { m, useScroll } from 'motion/react';
import { ArrowDown, CircleCheck, MessageSquareWarning } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, type CSSProperties } from 'react';

import { Reveal } from '@/components/motion/reveal';
import { Badge } from '@/components/ui/badge';

import { SectionHeading } from './section-heading';

const BUBBLES = ['bubble1', 'bubble2', 'bubble3'] as const;

const ROWS = [
  { key: 'rowAdvance', status: 'rowAdvanceStatus', tone: 'text-success-text', check: true },
  { key: 'rowVenue', status: 'rowVenueStatus', tone: 'text-primary-text', check: false },
  { key: 'rowGuests', status: 'rowGuestsStatus', tone: 'text-success-text', check: false },
] as const;

/**
 * "From 12 WhatsApp groups… to one shared plan" (MOTION.md 6.2, scroll-linked).
 * One scroll progress value (0 → 1 while the section moves up to the middle of the screen)
 * is written to the CSS variable --drift; CSS turns it into each element's movement:
 * - chat bubbles drift toward the plan card (right on desktop, down on phones) and dim to 70%
 *   (full-colour text, so it stays above AA contrast while dimmed);
 * - the plan card scales 0.92 → 1.
 * Reduced motion is handled in CSS (motion.css): the --motion switch zeroes the effect.
 */
export function ProblemSolution() {
  const t = useTranslations('home.problem');
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });

  return (
    <m.section
      ref={ref}
      aria-labelledby="problem-title"
      className="bg-surface-band py-16 lg:py-24"
      style={{ '--drift': scrollYProgress } as unknown as CSSProperties}
    >
      <div className="mx-auto max-w-content px-4 lg:px-8">
        <SectionHeading
          id="problem-title"
          eyebrow={t('eyebrow')}
          title={t('title')}
          body={t('body')}
          tone="danger"
        />

        <div className="mt-12 grid items-stretch gap-4 lg:mt-16 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
          <Reveal className="flex">
            <div className="flex flex-1 flex-col rounded-dialog border border-border bg-surface p-5 shadow-card sm:p-6">
              <p className="flex items-center gap-2 text-label text-danger-text">
                <MessageSquareWarning aria-hidden className="size-5" />
                {t('chatTitle')}
              </p>
              {/* lg:pr-6 leaves room for the 24 px drift inside the card. */}
              <ul className="mt-4 mb-6 space-y-3 lg:pr-6">
                {BUBBLES.map((key, index) => (
                  <li
                    key={key}
                    style={{ '--k': (index + 1) / BUBBLES.length } as CSSProperties}
                    className="drift-bubble rounded-card bg-surface-muted px-4 py-3 text-body"
                  >
                    {t(key)}
                  </li>
                ))}
              </ul>
              <p className="mt-auto flex justify-between gap-3 border-t border-border pt-4 text-small">
                <span className="text-fg-muted">{t('chatStatus')}</span>
                <span className="text-danger-text">{t('chatProblem')}</span>
              </p>
            </div>
          </Reveal>

          <div aria-hidden className="flex items-center justify-center">
            <span className="grid size-10 place-items-center rounded-full bg-primary text-on-primary shadow-card">
              <ArrowDown className="size-5 lg:-rotate-90" />
            </span>
          </div>

          <Reveal className="flex" delay={0.08}>
            <div className="drift-card flex flex-1 flex-col rounded-dialog border border-border bg-surface p-5 shadow-raised sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-label">
                  <span aria-hidden className="size-2 rounded-full bg-success" />
                  {t('planTitle')}
                </p>
                <Badge tone="success">{t('planBadge')}</Badge>
              </div>
              <ul className="mt-4 mb-6 space-y-3">
                {ROWS.map((row) => (
                  <li
                    key={row.key}
                    className="flex items-center justify-between gap-3 rounded-card border border-border px-4 py-3"
                  >
                    <span className="text-body">{t(row.key)}</span>
                    <span className={`flex items-center gap-1 text-small ${row.tone}`}>
                      {row.check && <CircleCheck aria-hidden className="size-4" />}
                      {t(row.status)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-auto flex justify-between gap-3 border-t border-border pt-4 text-small">
                <span className="text-fg-muted">{t('planStatus')}</span>
                <span className="text-success-text">{t('planResult')}</span>
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </m.section>
  );
}
