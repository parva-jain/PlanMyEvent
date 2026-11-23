'use client';

import { MAX_UPLOAD_BYTES } from '@pme/contracts';
import { ExternalLink, FileText, Loader2, Paperclip, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import { ProgressFill } from '@/components/motion/progress-fill';
import { useCurrentEvent } from '@/components/shell/current-event';
import { Button } from '@/components/ui/button';
import { fetchMediaUrl, uploadFile, useMedia } from '@/lib/media';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

/**
 * An expense's receipt (APIDesign "Upload a receipt"): a photo or PDF uploaded straight to
 * private storage, then linked by id. "View" asks for a link valid 5 minutes. Saved with the
 * rest of the form; removing only unlinks it.
 */
export function ReceiptField({
  mediaId,
  subEventId,
  disabled,
  onChange,
}: {
  mediaId: string | null;
  subEventId: string | null;
  disabled: boolean;
  onChange: (mediaId: string | null) => void;
}) {
  const t = useTranslations('budget.receipt');
  const { eventId } = useCurrentEvent();
  const input = useRef<HTMLInputElement>(null);
  const { data: receipt } = useMedia(eventId, mediaId);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  async function attach(file: File) {
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) return setError(t('tooBig'));
    if (!ACCEPT.split(',').includes(file.type)) return setError(t('wrongType'));
    setProgress(0);
    try {
      const media = await uploadFile(eventId, file, { kind: 'receipt', subEventId }, setProgress);
      onChange(media.id);
    } catch {
      setError(t('failed'));
    } finally {
      setProgress(null);
    }
  }

  async function view() {
    if (!mediaId) return;
    // Opened first, filled once the link arrives, so pop-up blockers allow it.
    const tab = window.open('', '_blank', 'noopener');
    setOpening(true);
    try {
      const { url } = await fetchMediaUrl(eventId, mediaId);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch {
      tab?.close();
      setError(t('openFailed'));
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="receipt-field">
      <span className="text-label">{t('label')}</span>
      {progress !== null ? (
        <div className="flex items-center gap-3 rounded-control bg-surface-muted px-3 py-2">
          <Paperclip aria-hidden className="size-4 text-fg-secondary" />
          <ProgressFill
            value={Math.round(progress * 100)}
            label={t('uploading')}
            className="flex-1"
          />
        </div>
      ) : mediaId ? (
        <div className="flex items-center gap-3 rounded-control bg-surface-muted px-3 py-2">
          {receipt?.status === 'pending' ? (
            <Loader2
              aria-hidden
              className="size-4 animate-spin text-fg-secondary reduce-motion:animate-none"
            />
          ) : (
            <FileText aria-hidden className="size-4 text-fg-secondary" />
          )}
          <span className="min-w-0 flex-1 truncate text-small" data-testid="receipt-status">
            {receipt?.status === 'failed'
              ? t('unreadable')
              : receipt?.status === 'pending'
                ? t('processing')
                : t('attached')}
          </span>
          {receipt?.status === 'ready' && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              icon={<ExternalLink aria-hidden />}
              loading={opening}
              onClick={() => void view()}
            >
              {t('view')}
            </Button>
          )}
          {!disabled && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              icon={<X aria-hidden />}
              onClick={() => onChange(null)}
              aria-label={t('remove')}
            >
              {t('remove')}
            </Button>
          )}
        </div>
      ) : (
        !disabled && (
          <>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              aria-label={t('attach')}
              data-testid="receipt-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void attach(file);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<Paperclip aria-hidden />}
              onClick={() => input.current?.click()}
              className="self-start"
            >
              {t('attach')}
            </Button>
          </>
        )
      )}
      {error && (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
