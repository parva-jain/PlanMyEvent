import { LayoutTemplate, Radio, ShieldCheck, Sparkles, UserPlus, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Reveal, RevealGroup } from '@/components/motion/reveal';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { SectionHeading } from './section-heading';
import { StepConnector } from './step-connector';

const STEPS = [
  {
    key: 'step1',
    Icon: LayoutTemplate,
    MetaIcon: Sparkles,
    tint: 'bg-primary-tint text-primary-text',
  },
  { key: 'step2', Icon: UserPlus, MetaIcon: ShieldCheck, tint: 'bg-accent-tint text-accent-text' },
  { key: 'step3', Icon: Zap, MetaIcon: Radio, tint: 'bg-success-tint text-success-text' },
] as const;

/** Three steps revealed with staggerSection; on desktop a connector draws between the markers. */
export function HowItWorks() {
  const t = useTranslations('home.howItWorks');

  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-16 py-16 lg:py-24">
      <div className="mx-auto max-w-content px-4 lg:px-8">
        <SectionHeading id="how-title" eyebrow={t('eyebrow')} title={t('title')} body={t('body')} />

        <div aria-hidden className="relative mt-12 hidden grid-cols-3 gap-6 lg:grid">
          <StepConnector />
          {STEPS.map((step, index) => (
            <div key={step.key} className="relative flex justify-center">
              <span className="grid size-10 place-items-center rounded-full border-2 border-primary bg-background text-label text-primary-text">
                {index + 1}
              </span>
            </div>
          ))}
        </div>

        <RevealGroup className="mt-10 grid gap-4 lg:mt-8 lg:grid-cols-3 lg:gap-6">
          {STEPS.map(({ key, Icon, MetaIcon, tint }) => (
            <Reveal key={key} className="flex">
              <Card className="flex-1">
                <span className={cn('grid size-10 place-items-center rounded-control', tint)}>
                  <Icon aria-hidden className="size-5" />
                </span>
                <div>
                  <p className="text-caption font-semibold tracking-wide text-primary-text uppercase">
                    {t(`${key}.label`)}
                  </p>
                  <h3 className="mt-1 text-h3">{t(`${key}.title`)}</h3>
                  <p className="mt-2 text-body text-fg-secondary">{t(`${key}.body`)}</p>
                </div>
                <p className="mt-auto flex items-center gap-2 border-t border-border pt-4 text-small text-fg-secondary">
                  <MetaIcon aria-hidden className="size-4 text-primary-text" />
                  {t(`${key}.meta`)}
                </p>
              </Card>
            </Reveal>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
