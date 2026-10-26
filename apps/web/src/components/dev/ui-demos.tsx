'use client';

import { Plus, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const STATUS_TONES = ['success', 'warning', 'danger', 'info', 'accent', 'neutral'] as const;
const EVENT_TONES = ['wedding', 'conference', 'fair', 'celebration', 'custom'] as const;
const TABS = ['weddings', 'conferences', 'collegeFests', 'fairs'] as const;
const FAQ = ['faqFree', 'faqGuests'] as const;

/** Base UI components (step E). */
export function UiDemos() {
  const t = useTranslations('devUi.ui');
  const [loading, setLoading] = useState(false);

  const save = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1500);
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h3 className="text-label text-fg-secondary">{t('buttons')}</h3>
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={<Plus strokeWidth={1.75} />}>{t('addTask')}</Button>
          <Button variant="secondary">{t('cancel')}</Button>
          <Button variant="ghost">{t('viewAll')}</Button>
          <Button variant="destructive">{t('delete')}</Button>
          <Button size="sm" variant="secondary">
            {t('small')}
          </Button>
          <Button size="icon" variant="secondary" aria-label={t('addTask')}>
            <Plus strokeWidth={1.75} />
          </Button>
          <Button icon={<Send strokeWidth={1.75} />} loading={loading} onClick={save}>
            {t('sendInvitations')}
          </Button>
          <Button disabled>{t('disabled')}</Button>
        </div>
        <p className="text-small text-fg-muted">{t('loadingHint')}</p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-label text-fg-secondary">{t('badges')}</h3>
        <div className="flex flex-wrap gap-2">
          {STATUS_TONES.map((tone) => (
            <Badge key={tone} tone={tone} dot>
              {t(`tone.${tone}`)}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {EVENT_TONES.map((tone) => (
            <Badge key={tone} tone={tone}>
              {t(`event.${tone}`)}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-label text-fg-secondary">{t('cards')}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('cardTitle')}</CardTitle>
              <CardDescription>{t('cardDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge tone="success" dot>
                {t('tone.success')}
              </Badge>
            </CardContent>
            <CardFooter>
              <Button size="sm" variant="secondary">
                {t('viewAll')}
              </Button>
            </CardFooter>
          </Card>
          <Card interactive>
            <CardHeader>
              <CardTitle>{t('interactiveTitle')}</CardTitle>
              <CardDescription>{t('interactiveDescription')}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-label text-fg-secondary">{t('tabs')}</h3>
        <Tabs defaultValue="conferences">
          <TabsList aria-label={t('tabsLabel')}>
            {TABS.map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {t(`tab.${tab}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((tab) => (
            <TabsContent key={tab} value={tab}>
              <Card>
                <p>{t(`tabBody.${tab}`)}</p>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-label text-fg-secondary">{t('accordion')}</h3>
        <Accordion type="single" collapsible className="max-w-2xl">
          {FAQ.map((item) => (
            <AccordionItem key={item} value={item}>
              <AccordionTrigger>{t(`${item}.question`)}</AccordionTrigger>
              <AccordionContent>{t(`${item}.answer`)}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
}
