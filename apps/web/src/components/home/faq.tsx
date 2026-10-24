import { useTranslations } from 'next-intl';

import { Reveal } from '@/components/motion/reveal';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

import { SectionHeading } from './section-heading';

const QUESTIONS = ['free', 'guests', 'together', 'eventTypes', 'data', 'hindi'] as const;

/** FAQ (MOTION.md 6.2: accordion height animates, chevron rotates 180°). */
export function Faq() {
  const t = useTranslations('home.faq');

  return (
    <section aria-labelledby="faq-title" className="py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-4 lg:px-8">
        <SectionHeading id="faq-title" eyebrow={t('eyebrow')} title={t('title')} />
        <Reveal className="mt-10 lg:mt-12">
          <Accordion type="single" collapsible>
            {QUESTIONS.map((key) => (
              <AccordionItem key={key} value={key}>
                <AccordionTrigger>{t(`${key}.q`)}</AccordionTrigger>
                <AccordionContent>{t(`${key}.a`)}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
