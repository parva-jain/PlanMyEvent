'use client';

import {
  importRows,
  MAX_IMPORT_ROWS,
  normalizePhone,
  parseCsv,
  type ContactImportMapping,
  type ParsedCsv,
} from '@pme/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileSpreadsheet, Upload, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type DragEvent } from 'react';

import { CheckDraw } from '@/components/motion/check-draw';
import { CountUp } from '@/components/motion/count-up';
import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { ProgressFill } from '@/components/motion/progress-fill';
import { useCurrentEvent } from '@/components/shell/current-event';
import { eventHref } from '@/components/shell/nav';
import { NoAccess } from '@/components/shell/no-access';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { distance, duration, ease } from '@/lib/motion';
import { refreshPeople, useJobStatus, useStartImport } from '@/lib/people';
import { cn } from '@/lib/utils';

/** The API takes up to 900 KB of CSV text. */
const MAX_BYTES = 900_000;
const PREVIEW_ROWS = 5;

const FIELDS = ['name', 'phone', 'email', 'tags', 'household', 'expectedCount', 'notes'] as const;
type Target = (typeof FIELDS)[number] | '';

/** Headers we recognise, lower-cased, for the first guess at the mapping. */
const GUESSES: Record<(typeof FIELDS)[number], RegExp> = {
  name: /^(full ?name|name|guest( name)?|first ?name|last ?name|surname|naam)$/,
  phone: /^(phone|mobile|mobile no\.?|phone number|whatsapp|contact( no\.?)?|number)$/,
  email: /^(e-?mail( id| address)?)$/,
  tags: /^(tags?|side|group|category|labels?)$/,
  household: /^(household|family|family name|parivar)$/,
  expectedCount: /^(count|expected|people|members|headcount|pax|no\.? of (people|guests))$/,
  notes: /^(notes?|remarks?|comments?)$/,
};

type Step = 1 | 2 | 3 | 4;

/** Each file column → the field it fills, by header. */
type Columns = Record<string, Target>;

function guessColumns(headers: readonly string[]): Columns {
  const used = new Set<string>();
  return Object.fromEntries(
    headers.map((header) => {
      const key = header.trim().toLowerCase();
      const field = FIELDS.find(
        (item) => GUESSES[item].test(key) && (item === 'name' || !used.has(item)),
      );
      if (field) used.add(field);
      return [header, field ?? ''];
    }),
  );
}

/** The API's mapping from the columns; null while no column is the name. */
function mappingOf(columns: Columns): ContactImportMapping | null {
  const pick = (field: Target) =>
    Object.entries(columns).find(([, target]) => target === field)?.[0];
  const name = Object.entries(columns)
    .filter(([, target]) => target === 'name')
    .map(([header]) => header)
    .slice(0, 3);
  if (!name.length) return null;
  return {
    name,
    phone: pick('phone'),
    email: pick('email'),
    tags: pick('tags'),
    household: pick('household'),
    expectedCount: pick('expectedCount'),
    notes: pick('notes'),
  };
}

/**
 * Import guests from a CSV in four steps (Stitch "Import guests"): upload, match columns,
 * review, import. The file is read here for the mapping and preview; the worker does the
 * import in chunks and reports progress (MOTION.md 6.15).
 */
export function ImportWizard() {
  const t = useTranslations('people.import');
  const { eventId, can } = useCurrentEvent();
  const reduced = useShouldReduceMotion();
  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState(1);
  const [file, setFile] = useState<{ name: string; text: string; csv: ParsedCsv } | null>(null);
  const [columns, setColumns] = useState<Columns>({});
  const [jobId, setJobId] = useState<string | null>(null);
  const back = `${eventHref(eventId, 'people')}`;

  if (!can('guests.edit')) return <NoAccess permission="guests.edit" />;

  const go = (next: Step) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };
  const mapping = mappingOf(columns);
  const slide = {
    initial: { opacity: 0, x: reduced ? 0 : direction * distance.riseLarge },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: reduced ? 0 : -direction * distance.riseLarge },
    transition: { duration: reduced ? duration.fast : duration.moderate, ease: ease.out },
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 lg:gap-8">
      <div className="flex flex-col gap-2">
        <Link
          href={back}
          className="flex items-center gap-1 self-start text-small text-fg-secondary hover:text-fg"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t('back')}
        </Link>
        <h1 className="text-h1-phone sm:text-h1">{t('title')}</h1>
        <p className="text-body text-fg-secondary">{t('subtitle')}</p>
      </div>
      <ol className="grid grid-cols-4 gap-2" aria-label={t('steps')}>
        {([1, 2, 3, 4] as const).map((item) => (
          <li
            key={item}
            aria-current={item === step ? 'step' : undefined}
            className={cn(
              'flex flex-col gap-1 border-b-2 pb-2 text-small',
              item <= step ? 'border-primary text-primary-text' : 'border-border text-fg-muted',
            )}
          >
            <span className="text-caption">{t('stepNumber', { step: item })}</span>
            <span className="text-label">{t(`step${item}`)}</span>
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        <m.section key={step} {...slide} className="flex flex-col gap-6">
          {step === 1 && (
            <UploadStep
              file={file}
              onFile={(next) => {
                setFile(next);
                setColumns(next ? guessColumns(next.csv.headers) : {});
              }}
              onNext={() => go(2)}
            />
          )}
          {step === 2 && file && (
            <MatchStep
              csv={file.csv}
              columns={columns}
              onChange={setColumns}
              onBack={() => go(1)}
              onNext={() => go(3)}
              ready={mapping !== null}
            />
          )}
          {step === 3 && file && mapping && (
            <ReviewStep
              file={file}
              mapping={mapping}
              onBack={() => go(2)}
              onStarted={(id) => {
                setJobId(id);
                go(4);
              }}
            />
          )}
          {step === 4 && jobId && <RunStep jobId={jobId} back={back} />}
        </m.section>
      </AnimatePresence>
    </div>
  );
}

function UploadStep({
  file,
  onFile,
  onNext,
}: {
  file: { name: string; csv: ParsedCsv } | null;
  onFile: (file: { name: string; text: string; csv: ParsedCsv } | null) => void;
  onNext: () => void;
}) {
  const t = useTranslations('people.import');
  const reduced = useShouldReduceMotion();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function read(chosen: File | undefined) {
    if (!chosen) return;
    setError(null);
    if (!/\.(csv|txt|tsv)$/i.test(chosen.name)) return setError(t('notCsv'));
    if (chosen.size > MAX_BYTES) return setError(t('tooBig'));
    const text = await chosen.text();
    const csv = parseCsv(text);
    if (!csv.headers.length || !csv.rows.length) return setError(t('noRows'));
    if (csv.rows.length > MAX_IMPORT_ROWS) {
      return setError(t('tooMany', { max: MAX_IMPORT_ROWS }));
    }
    onFile({ name: chosen.name, text, csv });
  }

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void read(e.dataTransfer.files[0]);
  };

  return (
    <>
      <m.label
        htmlFor="import-file"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        animate={{ scale: over && !reduced ? 1.01 : 1 }}
        transition={{ duration: duration.fast }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-3 rounded-card border-2 border-dashed bg-surface px-6 py-12 text-center transition-colors duration-(--dur-fast)',
          over ? 'border-primary bg-primary-tint/40' : 'border-border-strong',
        )}
        data-testid="drop-zone"
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-primary-tint">
          <Upload aria-hidden className="size-6 text-primary-text" />
        </span>
        <span className="text-h3">{t('drop')}</span>
        <span className="max-w-md text-small text-fg-secondary">{t('dropHint')}</span>
        <input
          ref={input}
          id="import-file"
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          className="sr-only"
          onChange={(e) => void read(e.target.files?.[0])}
        />
      </m.label>
      {error && (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      )}
      <AnimatePresence>
        {file && (
          <m.div
            initial={{ opacity: 0, scale: reduced ? 1 : 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: duration.moderate, ease: ease.overshoot }}
            className="flex items-center gap-3 rounded-control bg-surface-muted p-3"
            data-testid="file-chip"
          >
            <FileSpreadsheet aria-hidden className="size-6 text-success" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-label">{file.name}</span>
              <span className="text-small text-fg-secondary">
                {t('detected', { rows: file.csv.rows.length, columns: file.csv.headers.length })}
              </span>
            </span>
            <button
              type="button"
              aria-label={t('removeFile')}
              onClick={() => {
                onFile(null);
                if (input.current) input.current.value = '';
              }}
              className="flex size-10 items-center justify-center rounded-control text-fg-muted hover:bg-surface"
            >
              <X aria-hidden className="size-4" />
            </button>
          </m.div>
        )}
      </AnimatePresence>
      <p className="text-small text-fg-secondary">{t('excelHint')}</p>
      <Button className="self-end" disabled={!file} onClick={onNext}>
        {t('next')}
      </Button>
    </>
  );
}

function MatchStep({
  csv,
  columns,
  onChange,
  onBack,
  onNext,
  ready,
}: {
  csv: ParsedCsv;
  columns: Columns;
  onChange: (columns: Columns) => void;
  onBack: () => void;
  onNext: () => void;
  ready: boolean;
}) {
  const t = useTranslations('people.import');
  const first = csv.rows[0]?.cells ?? [];
  const names = Object.values(columns).filter((target) => target === 'name').length;

  /** One column per field, except up to three for the name ("First" + "Last"). */
  const set = (header: string, target: Target) => {
    const next = { ...columns, [header]: target };
    if (target && target !== 'name') {
      for (const other of Object.keys(next)) {
        if (other !== header && next[other] === target) next[other] = '';
      }
    }
    onChange(next);
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="text-h2">{t('matchTitle')}</h2>
        <p className="text-body text-fg-secondary">{t('matchHint')}</p>
      </div>
      <Card className="gap-0 p-0 sm:p-0" data-testid="column-mapping">
        {csv.headers.map((header, index) => {
          const target = columns[header] ?? '';
          return (
            <div
              key={header}
              className="flex flex-col gap-2 border-b border-border p-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-4"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-label">{header}</span>
                <span className="truncate text-small text-fg-secondary">
                  {first[index] || t('emptyCell')}
                </span>
              </span>
              <Select
                size="sm"
                aria-label={t('mapLabel', { column: header })}
                value={target}
                onChange={(e) => set(header, e.target.value as Target)}
                className="sm:w-56"
              >
                <option value="">{t('skip')}</option>
                {FIELDS.map((field) => (
                  <option
                    key={field}
                    value={field}
                    disabled={field === 'name' && names >= 3 && target !== 'name'}
                  >
                    {t(`fields.${field}`)}
                  </option>
                ))}
              </Select>
              <span className="flex w-24 items-center gap-1.5 text-small">
                {target ? (
                  <>
                    <CheckDraw checked size={16} className="text-success" />
                    <span className="text-success-text">{t('mapped')}</span>
                  </>
                ) : (
                  <span className="text-fg-muted">{t('skipped')}</span>
                )}
              </span>
            </div>
          );
        })}
      </Card>
      {!ready && (
        <p role="alert" className="text-small text-danger-text">
          {t('needName')}
        </p>
      )}
      <div className="flex justify-between gap-2">
        <Button variant="secondary" onClick={onBack}>
          {t('previous')}
        </Button>
        <Button disabled={!ready} onClick={onNext}>
          {t('next')}
        </Button>
      </div>
    </>
  );
}

function ReviewStep({
  file,
  mapping,
  onBack,
  onStarted,
}: {
  file: { name: string; text: string; csv: ParsedCsv };
  mapping: ContactImportMapping;
  onBack: () => void;
  onStarted: (jobId: string) => void;
}) {
  const t = useTranslations('people.import');
  const { eventId } = useCurrentEvent();
  const start = useStartImport(eventId);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const rows = importRows(file.csv, mapping);
  const noName = rows.filter((row) => !row.name).length;
  const badPhones = rows.filter((row) => row.phone && !normalizePhone(row.phone)).length;
  const households = new Set(rows.map((row) => row.household.toLowerCase()).filter(Boolean)).size;

  function run() {
    setError(null);
    start.mutate(
      { idempotencyKey, body: { csv: file.text, mapping } },
      {
        onSuccess: (accepted) => onStarted(accepted.jobId),
        onError: (failed) =>
          setError(
            failed instanceof ApiError && failed.status === 429
              ? t('rateLimited')
              : (failed instanceof ApiError && failed.problem?.fields?.[0]?.message) ||
                  t('startFailed'),
          ),
      },
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="text-h2">{t('reviewTitle')}</h2>
        <p className="text-body text-fg-secondary">{t('reviewHint')}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="import-review">
        <Fact label={t('rows')} value={rows.length} />
        <Fact label={t('householdsFound')} value={households} />
        <Fact label={t('noName')} value={noName} warn={noName > 0} />
        <Fact label={t('badPhones')} value={badPhones} warn={badPhones > 0} />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-h3">{t('preview', { count: Math.min(PREVIEW_ROWS, rows.length) })}</h3>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="import-preview">
          {rows.slice(0, PREVIEW_ROWS).map((row) => (
            <li
              key={row.line}
              className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4"
            >
              <span className="text-caption text-fg-muted">{t('line', { line: row.line })}</span>
              <span className="text-label">{row.name || t('noNameShort')}</span>
              {row.household && (
                <span className="text-small text-fg-secondary">{row.household}</span>
              )}
              {row.phone && (
                <span className="text-small tabular-nums text-fg-secondary">
                  {normalizePhone(row.phone) ?? `${row.phone} · ${t('invalid')}`}
                </span>
              )}
              {row.email && (
                <span className="truncate text-small text-fg-secondary">{row.email}</span>
              )}
              {row.tags.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {row.tags.map((tag) => (
                    <Badge key={tag} tone="accent">
                      {tag}
                    </Badge>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-small text-fg-secondary">{t('mergeNote')}</p>
      {error && (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      )}
      <div className="flex justify-between gap-2">
        <Button variant="secondary" onClick={onBack}>
          {t('previous')}
        </Button>
        <Button loading={start.isPending} onClick={run}>
          {t('start', { count: rows.length })}
        </Button>
      </div>
    </>
  );
}

function Fact({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <Card className="gap-1">
      <span className="text-small text-fg-secondary">{label}</span>
      <span className={cn('text-h2 tabular-nums', warn && 'text-warning-text')}>
        {value.toLocaleString('en-IN')}
      </span>
    </Card>
  );
}

/** Progress from the job's status, then what happened, with the rows that had problems. */
function RunStep({ jobId, back }: { jobId: string; back: string }) {
  const t = useTranslations('people.import');
  const { eventId } = useCurrentEvent();
  const queryClient = useQueryClient();
  const { data: job, isError } = useJobStatus(eventId, jobId);
  const finished = job?.status === 'succeeded' || job?.status === 'failed';

  // The worker's writes are this tab's own: refresh the lists ourselves once it's done.
  useEffect(() => {
    if (finished) refreshPeople(queryClient, eventId);
  }, [finished, queryClient, eventId]);

  const percent = job && job.progress.total ? (job.progress.done / job.progress.total) * 100 : 0;
  const result = job?.result;

  return (
    <div className="flex flex-col gap-6" data-testid="import-run">
      {!finished && (
        <Card className="gap-3">
          <h2 className="text-h3">{t('running')}</h2>
          <ProgressFill value={percent} label={t('progressLabel')} />
          <span className="text-small tabular-nums text-fg-secondary">
            {job
              ? t('progress', { done: job.progress.done, total: job.progress.total })
              : t('queued')}
          </span>
          {isError && (
            <p role="alert" className="text-small text-danger-text">
              {t('statusFailed')}
            </p>
          )}
        </Card>
      )}
      {job?.status === 'failed' && (
        <Card role="alert" className="gap-2">
          <h2 className="text-h3">{t('failedTitle')}</h2>
          <p className="text-body text-fg-secondary">{job.error ?? t('failedBody')}</p>
        </Card>
      )}
      {job?.status === 'succeeded' && result && (
        <>
          <Card className="gap-4" role="status">
            <h2 className="text-h3">{t('doneTitle')}</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="import-result">
              <Result label={t('created')} value={result.created} />
              <Result label={t('updated')} value={result.updated} />
              <Result label={t('skippedRows')} value={result.skipped} />
              <Result label={t('householdsCreated')} value={result.householdsCreated} />
            </div>
          </Card>
          {result.errors.length > 0 && (
            <Card className="gap-3">
              <h3 className="text-h3">{t('problems', { count: result.errorCount })}</h3>
              <ul className="flex flex-col gap-1 text-small" data-testid="import-errors">
                {result.errors.map((item) => (
                  <li key={`${item.line}:${item.message}`}>
                    <span className="tabular-nums text-fg-muted">
                      {t('line', { line: item.line })}
                    </span>{' '}
                    {item.message}
                  </li>
                ))}
              </ul>
              {result.errorCount > result.errors.length && (
                <p className="text-small text-fg-secondary">
                  {t('moreProblems', { count: result.errorCount - result.errors.length })}
                </p>
              )}
            </Card>
          )}
        </>
      )}
      {finished && (
        <Button asChild className="self-start">
          <Link href={back}>{t('toGuests')}</Link>
        </Button>
      )}
    </div>
  );
}

function Result({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-small text-fg-secondary">{label}</span>
      <CountUp value={value} className="text-h2 tabular-nums" />
    </div>
  );
}
