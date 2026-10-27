import { Check } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Reveal, RevealGroup } from '@/components/motion/reveal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

import { SectionHeading } from './section-heading';

const PLANS = [
  { key: 'free', badgeTone: 'success', primary: true },
  { key: 'pro', badgeTone: 'accent', primary: false },
] as const;

const POINTS = ['point1', 'point2', 'point3', 'point4', 'point5'] as const;

/**
 * Pricing (MOTION.md 6.2: cards HoverLift; the "Coming soon" badge is static).
 * Prices and limits are placeholders until decided (PRD "Open questions").
 */
export function Pricing() {
  const t = useTranslations('home.pricing');

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      className="scroll-mt-16 bg-surface-band py-16 lg:py-24"
    >
      <div className="mx-auto max-w-content px-4 lg:px-8">
        <SectionHeading
          id="pricing-title"
          eyebrow={t('eyebrow')}
          title={t('title')}
          body={t('body')}
        />
        <RevealGroup className="mx-auto mt-12 grid max-w-4xl gap-4 md:grid-cols-2 lg:mt-16 lg:gap-6">
          {PLANS.map(({ key, badgeTone, primary }) => (
            <Reveal key={key} className="flex">
              <Card interactive className="flex-1 gap-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-h3">{t(`${key}.name`)}</h3>
                    <p className="text-small text-fg-secondary">{t(`${key}.audience`)}</p>
                  </div>
                  <Badge tone={badgeTone}>{t(`${key}.badge`)}</Badge>
                </div>
                <p>
                  <span className="text-display-phone tabular-nums">{t(`${key}.price`)}</span>{' '}
                  <span className="text-body text-fg-secondary">{t(`${key}.period`)}</span>
                </p>
                <Button asChild variant={primary ? 'primary' : 'secondary'} className="w-full">
                  {/* No prefetch: the home page shouldn't spend bandwidth on /sign-in up front. */}
                  <Link href="/sign-in" prefetch={false}>
                    {t(`${key}.cta`)}
                  </Link>
                </Button>
                <ul className="space-y-3">
                  {POINTS.map((point) => (
                    <li key={point} className="flex items-start gap-3 text-body">
                      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                      {t(`${key}.${point}`)}
                    </li>
                  ))}
                </ul>
              </Card>
            </Reveal>
          ))}
        </RevealGroup>
        <Reveal>
          <p className="mt-6 text-center text-small text-fg-secondary">{t('note')}</p>
        </Reveal>
      </div>
    </section>
  );
}
