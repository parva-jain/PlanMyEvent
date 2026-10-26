import { ArrowDown, ArrowRight, BadgeCheck, Check, Mail, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CSSProperties, ReactNode } from 'react';

import { AmbientFloat } from '@/components/motion/ambient-float';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { distance, stagger } from '@/lib/motion';
import { cn } from '@/lib/utils';

import { EventTypePills } from './event-type-pills';
import { LivePlanCard } from './live-plan-card';

/** MOTION.md 6.2: headline words stagger 60 ms; the rest follows 150 ms after the last word. */
const WORD_STAGGER = 0.06;
const FOLLOW_DELAY = 0.15;
/** The plan card rises in 300 ms after the headline starts; floating cards follow it. */
const CARD_DELAY = 0.3;

// /sign-in arrives in milestone 2; `prefetch={false}` on its links avoids a 404 prefetch until then.

/** Inline style for a `.rise-in` element (CSS entrance, see motion.css). */
function riseIn(delay: number, rise: number = distance.rise): CSSProperties {
  return { '--delay': `${delay}s`, '--rise': `${rise}px` } as CSSProperties;
}

export function Hero() {
  const t = useTranslations('home.hero');
  const lead = t('headlineLead').split(' ');
  const emphasis = t('headlineEmphasis').split(' ');
  const words = [
    ...lead.map((word) => ({ word, em: false })),
    ...emphasis.map((word) => ({ word, em: true })),
  ];
  const afterHeadline = words.length * WORD_STAGGER + FOLLOW_DELAY;

  return (
    <section className="relative overflow-x-clip">
      <div className="mx-auto grid max-w-content items-center gap-12 px-4 pt-8 pb-16 sm:pt-12 lg:grid-cols-2 lg:gap-8 lg:px-8 lg:pt-16 lg:pb-24">
        <div className="text-center lg:text-left">
          <Badge
            tone="accent"
            dot
            className="rise-in border border-accent/30 px-3 py-1 text-label font-medium"
            style={riseIn(0)}
          >
            {t('eyebrow')}
          </Badge>

          <h1 className="mt-5 text-display-phone tracking-tight sm:text-display">
            {words.map(({ word, em }, index) => (
              <span key={index}>
                <span
                  className={cn('rise-in inline-block', em && 'text-primary-text')}
                  style={riseIn(index * WORD_STAGGER, distance.riseLarge)}
                >
                  {word}
                </span>
                {index < words.length - 1 && ' '}
              </span>
            ))}
          </h1>

          <p
            className="rise-in mx-auto mt-5 max-w-xl text-body-lg text-fg-secondary lg:mx-0"
            style={riseIn(afterHeadline)}
          >
            {t('subheading')}
          </p>

          <div
            className="rise-in mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start"
            style={riseIn(afterHeadline)}
          >
            <Button asChild className="lg:h-12 lg:px-6">
              <Link href="/sign-in" prefetch={false}>
                {t('primaryCta')}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="secondary" className="lg:h-12 lg:px-6">
              <a href="#how-it-works">
                <ArrowDown aria-hidden className="text-primary-text" />
                {t('secondaryCta')}
              </a>
            </Button>
          </div>

          <div className="rise-in mt-10" style={riseIn(afterHeadline)}>
            <EventTypePills className="flex flex-col items-center lg:items-start" />
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none lg:py-12 lg:pr-6 lg:pl-12">
          <div className="rise-in" style={riseIn(CARD_DELAY, distance.riseLarge)}>
            <LivePlanCard />
          </div>
          <FloatingCards />
        </div>
      </div>
    </section>
  );
}

/** Desktop only: three small cards around the plan, entering one by one, then drifting. */
function FloatingCards() {
  const t = useTranslations('home.hero.floating');
  const base = CARD_DELAY + stagger.section * 2;

  return (
    <div aria-hidden className="hidden lg:block">
      <Floating className="-top-2 -left-2" order={0} base={base} offset={0}>
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="grid size-9 place-items-center rounded-full bg-success-tint text-success">
            <BadgeCheck className="size-5" />
          </span>
          <div>
            <p className="text-small font-semibold">{t('completedTitle')}</p>
            <p className="text-caption text-fg-secondary">{t('completedDetail')}</p>
          </div>
        </div>
      </Floating>

      <Floating className="bottom-6 -left-8" order={1} base={base} offset={2}>
        <p className="flex items-center gap-2 px-4 py-3 text-small font-semibold">
          <Wallet className="size-5 text-accent" />
          {t('paid')}
        </p>
      </Floating>

      <Floating className="-right-4 -bottom-4 w-64 rotate-2" order={2} base={base} offset={4}>
        <div className="p-4">
          <p className="flex items-center gap-2 text-caption font-semibold tracking-wide text-event-wedding-text uppercase">
            <Mail className="size-4" />
            {t('rsvpLabel')}
          </p>
          <p className="mt-1 font-display text-h3">{t('rsvpEvent')}</p>
          <p className="text-caption text-fg-secondary">{t('rsvpDetail')}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-small">
            <span className="flex h-9 items-center justify-center gap-1 rounded-control bg-success text-white">
              <Check className="size-4" />
              {t('rsvpYes')}
            </span>
            <span className="flex h-9 items-center justify-center rounded-control bg-surface-muted text-fg-secondary">
              {t('rsvpDecline')}
            </span>
          </div>
        </div>
      </Floating>
    </div>
  );
}

function Floating({
  children,
  className,
  order,
  base,
  offset,
}: {
  children: ReactNode;
  className: string;
  order: number;
  base: number;
  /** Drift phase in seconds, so the cards don't move in step. */
  offset: number;
}) {
  return (
    <div className={cn('absolute', className)}>
      <div className="rise-in" style={riseIn(base + order * stagger.section)}>
        <AmbientFloat offset={offset}>
          <div className="rounded-card border border-border bg-surface shadow-raised">
            {children}
          </div>
        </AmbientFloat>
      </div>
    </div>
  );
}
