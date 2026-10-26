'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { CheckDraw } from '@/components/motion/check-draw';
import { CountUp } from '@/components/motion/count-up';
import { LiveHighlight } from '@/components/motion/live-highlight';
import { ProgressFill } from '@/components/motion/progress-fill';

import { Demo } from './demo';

const INR = { style: 'currency', currency: 'INR', maximumFractionDigits: 0 } as const;

/** Numbers and state patterns: CountUp, ProgressFill, CheckDraw, LiveHighlight. */
export function StateDemos() {
  const t = useTranslations('devUi.demos');
  const [registrations, setRegistrations] = useState(1180);
  const [progress, setProgress] = useState(78);
  const [done, setDone] = useState(false);
  const [change, setChange] = useState<{ key: number; source: 'others' | 'own' } | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Demo title="CountUp" description={t('countUp')} replayable>
        {(key) => (
          <div key={key} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-6">
              <p className="flex flex-col">
                <CountUp value={registrations} className="text-h1" />
                <span className="text-small text-fg-secondary">{t('registrations')}</span>
              </p>
              <p className="flex flex-col">
                <CountUp value={345000} format={INR} className="text-h1" />
                <span className="text-small text-fg-secondary">{t('spent')}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRegistrations((n) => n + 24)}
              className="pressable self-start rounded-control border border-border px-3 py-1.5 text-small hover:bg-surface-muted"
            >
              {t('addRegistrations')}
            </button>
          </div>
        )}
      </Demo>

      <Demo title="ProgressFill" description={t('progressFill')} replayable>
        {(key) => (
          <div key={key} className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <ProgressFill value={progress} label={t('milestone')} className="flex-1" />
              <ProgressFill value={progress} label={t('milestone')} variant="ring" />
              <span className="w-10 text-label tabular-nums">{progress}%</span>
            </div>
            <div className="flex gap-2">
              {[78, 100].map((target) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => setProgress(target)}
                  className="pressable rounded-control border border-border px-3 py-1.5 text-small hover:bg-surface-muted"
                >
                  {t('setTo', { value: target })}
                </button>
              ))}
            </div>
          </div>
        )}
      </Demo>

      <Demo title="CheckDraw" description={t('checkDraw')}>
        {() => (
          <label className="flex cursor-pointer items-center gap-3 rounded-control border border-border px-3 py-3">
            <input
              type="checkbox"
              className="sr-only"
              checked={done}
              onChange={(e) => setDone(e.target.checked)}
            />
            <CheckDraw checked={done} />
            <span className={done ? 'text-fg-muted line-through' : ''}>{t('taskTitle')}</span>
          </label>
        )}
      </Demo>

      <Demo title="LiveHighlight" description={t('liveHighlight')}>
        {() => (
          <div className="flex flex-col gap-3">
            <LiveHighlight
              highlightKey={change?.key ?? null}
              source={change?.source}
              label={change?.source === 'others' ? t('teammateLabel') : undefined}
              className="rounded-control"
            >
              <div className="flex items-center justify-between rounded-control border border-border px-3 py-3">
                <span>{t('expenseRow')}</span>
                <span className="text-small text-success-text">{t('paid')}</span>
              </div>
            </LiveHighlight>
            <div className="flex gap-2">
              {(['others', 'own'] as const).map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => setChange({ key: Date.now(), source })}
                  className="pressable rounded-control border border-border px-3 py-1.5 text-small hover:bg-surface-muted"
                >
                  {source === 'others' ? t('simulateTeammate') : t('simulateOwn')}
                </button>
              ))}
            </div>
          </div>
        )}
      </Demo>
    </div>
  );
}
