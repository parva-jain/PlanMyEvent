'use client';

import type { Media } from '@pme/contracts';
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { Dialog as Radix } from 'radix-ui';
import { useEffect, useState } from 'react';

import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { useReturnFocus } from '@/components/motion/use-return-focus';
import { useCurrentEvent } from '@/components/shell/current-event';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDeleteMedia, useUpdateMedia } from '@/lib/media';
import { duration, ease } from '@/lib/motion';

/**
 * A photo full size on a dark backdrop, with previous and next (buttons and arrow keys).
 * Gallery managers edit the caption and delete here. Radix Dialog gives focus trapping,
 * Escape and aria; it fades and scales like other dialogs (MOTION.md section 4).
 */
export function PhotoViewer({
  photos,
  openId,
  onOpenChange,
  albumName,
}: {
  photos: Media[];
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  albumName: (subEventId: string | null) => string | null;
}) {
  const t = useTranslations('gallery.viewer');
  const reduced = useShouldReduceMotion();
  const index = photos.findIndex((item) => item.id === openId);
  const photo = index >= 0 ? photos[index] : undefined;
  const open = photo !== undefined;
  const returnFocus = useReturnFocus(open);
  const go = (step: number) => {
    const next = photos[index + step];
    if (next) onOpenChange(next.id);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).tagName === 'INPUT') return;
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const transition = { duration: reduced ? duration.fast : duration.moderate, ease: ease.out };
  return (
    <Radix.Root open={open} onOpenChange={(next) => !next && onOpenChange(null)}>
      <AnimatePresence>
        {open && photo && (
          <Radix.Portal forceMount>
            <Radix.Overlay asChild forceMount>
              <m.div
                className="fixed inset-0 z-50 bg-black/90"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition}
              />
            </Radix.Overlay>
            <Radix.Content
              asChild
              forceMount
              onCloseAutoFocus={returnFocus}
              aria-describedby={undefined}
            >
              <m.div
                className="fixed inset-0 z-50 flex flex-col text-white outline-none"
                initial={{ opacity: 0, scale: reduced ? 1 : 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={transition}
                data-testid="photo-viewer"
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <Radix.Title className="truncate text-small text-white/80">
                    {t('position', { index: index + 1, total: photos.length })}
                  </Radix.Title>
                  <Radix.Close asChild>
                    <button
                      type="button"
                      aria-label={t('close')}
                      className="flex size-11 items-center justify-center rounded-full hover:bg-white/10"
                    >
                      <X aria-hidden className="size-6" />
                    </button>
                  </Radix.Close>
                </div>
                <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16">
                  {/* eslint-disable-next-line @next/next/no-img-element -- already resized WebP from storage */}
                  <img
                    key={photo.id}
                    src={photo.urls!.display}
                    alt={photo.caption ?? ''}
                    className="max-h-full max-w-full object-contain"
                  />
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => go(-1)}
                      aria-label={t('previous')}
                      className="absolute left-2 flex size-11 items-center justify-center rounded-full bg-black/40 hover:bg-black/60"
                    >
                      <ChevronLeft aria-hidden className="size-6" />
                    </button>
                  )}
                  {index < photos.length - 1 && (
                    <button
                      type="button"
                      onClick={() => go(1)}
                      aria-label={t('next')}
                      className="absolute right-2 flex size-11 items-center justify-center rounded-full bg-black/40 hover:bg-black/60"
                    >
                      <ChevronRight aria-hidden className="size-6" />
                    </button>
                  )}
                </div>
                <Details
                  key={photo.id}
                  photo={photo}
                  album={albumName(photo.subEventId)}
                  onDeleted={() => onOpenChange(null)}
                />
              </m.div>
            </Radix.Content>
          </Radix.Portal>
        )}
      </AnimatePresence>
    </Radix.Root>
  );
}

function Details({
  photo,
  album,
  onDeleted,
}: {
  photo: Media;
  album: string | null;
  onDeleted: () => void;
}) {
  const t = useTranslations('gallery.viewer');
  const { eventId, can } = useCurrentEvent();
  const manage = can('gallery.manage', photo.subEventId);
  const update = useUpdateMedia(eventId);
  const remove = useDeleteMedia(eventId);
  const [caption, setCaption] = useState(photo.caption ?? '');
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const changed = caption.trim() !== (photo.caption ?? '');

  return (
    <div className="flex flex-col gap-3 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row sm:items-end">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {manage ? (
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setFailed(false);
              update.mutate(
                { media: photo, changes: { caption: caption.trim() || null } },
                { onError: () => setFailed(true) },
              );
            }}
          >
            <Input
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder={t('captionPlaceholder')}
              aria-label={t('caption')}
              maxLength={500}
              className="h-10 border-white/20 bg-white/10 text-white placeholder:text-white/50"
            />
            {changed && (
              <Button type="submit" size="sm" loading={update.isPending}>
                {t('save')}
              </Button>
            )}
          </form>
        ) : (
          photo.caption && <p className="text-body">{photo.caption}</p>
        )}
        <p className="text-small text-white/70">
          {[photo.uploadedBy && t('by', { name: photo.uploadedBy }), album]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {failed && (
          <p role="alert" className="text-small text-red-300">
            {t('failed')}
          </p>
        )}
      </div>
      {manage &&
        (confirming ? (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
              {t('keep')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(photo, { onSuccess: onDeleted, onError: () => setFailed(true) })
              }
            >
              {t('confirmDelete')}
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            icon={<Trash2 aria-hidden />}
            onClick={() => setConfirming(true)}
          >
            {t('delete')}
          </Button>
        ))}
    </div>
  );
}
