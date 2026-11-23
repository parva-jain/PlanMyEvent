'use client';

import { canSomewhere, MAX_UPLOAD_BYTES, type Media } from '@pme/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Images, ImageOff, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ChangeEvent } from 'react';

import { ListItem, ListPresence } from '@/components/motion/list-presence';
import { ProgressFill } from '@/components/motion/progress-fill';
import { Skeleton } from '@/components/motion/skeleton';
import { useCurrentEvent } from '@/components/shell/current-event';
import { LiveRow } from '@/components/shell/live-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useSubEvents } from '@/lib/events';
import { refreshMedia, uploadFile, useGallery } from '@/lib/media';
import { cn } from '@/lib/utils';

import { PhotoViewer } from './photo-viewer';

/** What browsers can show and the worker can convert (no HEIC: iPhones hand over JPEG). */
const ACCEPT = 'image/jpeg,image/png,image/webp';

interface Uploading {
  key: string;
  name: string;
  progress: number;
  error: string | null;
}

/**
 * Gallery (built from DESIGN.md; no Stitch screen): photos from the event, by album (the
 * whole event or a sub-event). Uploads go straight to storage with progress; each photo shows
 * as processing until the worker's WebP versions are ready, then appears for everyone live.
 * MOTION.md section 4 patterns: ListPresence for tiles arriving, SidePanel-like viewer.
 */
export function Gallery() {
  const t = useTranslations('gallery');
  const { eventId, membership } = useCurrentEvent();
  const queryClient = useQueryClient();
  const { data: subEvents = [] } = useSubEvents(eventId);
  const [album, setAlbum] = useState('');
  const gallery = useGallery(eventId, album);
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const canUpload = canSomewhere(membership.permissions, 'gallery.upload');
  const photos = gallery.data?.pages.flatMap((page) => page.data) ?? [];
  const ready = photos.filter((item) => item.status === 'ready');

  const albums = [
    { id: '', label: t('all') },
    { id: 'event', label: t('wholeEvent') },
    ...subEvents.map((item) => ({ id: item.id, label: item.name })),
  ];

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    const subEventId = album && album !== 'event' ? album : null;
    const set = (key: string, changes: Partial<Uploading>) =>
      setUploading((list) =>
        list.map((item) => (item.key === key ? { ...item, ...changes } : item)),
      );
    const jobs = files.map((file) => ({ file, key: crypto.randomUUID() }));
    setUploading((list) => [
      ...jobs.map(({ file, key }) => ({
        key,
        name: file.name,
        progress: 0,
        error:
          file.size > MAX_UPLOAD_BYTES
            ? t('tooBig')
            : !ACCEPT.split(',').includes(file.type)
              ? t('wrongType')
              : null,
      })),
      ...list,
    ]);
    // Three at a time: a phone on mobile data shouldn't open fifty uploads at once.
    const queue = jobs.filter(
      ({ file }) => file.size <= MAX_UPLOAD_BYTES && ACCEPT.split(',').includes(file.type),
    );
    const run = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const { file, key } = next;
        try {
          await uploadFile(eventId, file, { kind: 'gallery', subEventId }, (progress) =>
            set(key, { progress }),
          );
          setUploading((list) => list.filter((item) => item.key !== key));
          void refreshMedia(queryClient, eventId);
        } catch {
          set(key, { error: t('uploadFailed') });
        }
      }
    };
    await Promise.all([run(), run(), run()]);
  }

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1-phone sm:text-h1">{t('title')}</h1>
          {gallery.data && (
            <p className="text-body text-fg-secondary" data-testid="gallery-count">
              {t('count', { count: ready.length })}
            </p>
          )}
        </div>
        {canUpload && (
          <>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              multiple
              className="sr-only"
              aria-label={t('upload')}
              data-testid="gallery-input"
              onChange={(event) => void upload(event)}
            />
            <Button icon={<ImagePlus aria-hidden />} onClick={() => input.current?.click()}>
              {t('upload')}
            </Button>
          </>
        )}
      </div>

      <div role="tablist" aria-label={t('albums')} className="flex gap-2 overflow-x-auto pb-1">
        {albums.map((item) => (
          <button
            key={item.id || 'all'}
            type="button"
            role="tab"
            aria-selected={album === item.id}
            onClick={() => setAlbum(item.id)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-small',
              'transition-[background-color,border-color] duration-(--dur-fast) ease-(--ease-out)',
              album === item.id
                ? 'border-primary bg-primary-tint font-semibold text-primary-text'
                : 'border-border bg-surface text-fg-secondary hover:bg-surface-muted',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {uploading.length > 0 && (
        <ListPresence className="flex flex-col gap-2" aria-label={t('uploading')}>
          {uploading.map((item) => (
            <ListItem key={item.key}>
              <div
                className="flex items-center gap-3 rounded-control bg-surface-muted px-3 py-2"
                data-testid="upload-row"
              >
                <span className="min-w-0 flex-1 truncate text-small">{item.name}</span>
                {item.error ? (
                  <span className="text-small text-danger-text">{item.error}</span>
                ) : (
                  <ProgressFill
                    value={Math.round(item.progress * 100)}
                    label={t('uploadingFile', { name: item.name })}
                    className="w-32"
                  />
                )}
                {item.error && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setUploading((list) => list.filter((entry) => entry.key !== item.key))
                    }
                  >
                    {t('dismiss')}
                  </Button>
                )}
              </div>
            </ListItem>
          ))}
        </ListPresence>
      )}

      {gallery.isError && !gallery.data && (
        <Card className="items-center gap-3 py-8 text-center">
          <p className="text-body">{t('loadFailed')}</p>
          <Button variant="secondary" onClick={() => void gallery.refetch()}>
            {t('retry')}
          </Button>
        </Card>
      )}
      {gallery.isPending && (
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-2 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, index) => (
            <Skeleton key={index} className="aspect-square rounded-control" />
          ))}
        </div>
      )}

      {gallery.data && photos.length === 0 && (
        <Card className="items-center gap-3 py-12 text-center" data-testid="gallery-empty">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-tint">
            <Images aria-hidden className="size-6 text-primary-text" />
          </span>
          <h2 className="text-h3">{t('emptyTitle')}</h2>
          <p className="max-w-md text-body text-fg-secondary">
            {canUpload ? t('emptyBody') : t('emptyBodyViewer')}
          </p>
        </Card>
      )}

      {photos.length > 0 && (
        <ListPresence
          className="grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-2 lg:grid-cols-6"
          aria-label={t('photos')}
        >
          {photos.map((item) => (
            <ListItem key={item.id}>
              <Tile item={item} onOpen={() => setOpen(item.id)} />
            </ListItem>
          ))}
        </ListPresence>
      )}

      {gallery.hasNextPage && (
        <Button
          variant="secondary"
          loading={gallery.isFetchingNextPage}
          onClick={() => void gallery.fetchNextPage()}
          className="self-center"
        >
          {t('more')}
        </Button>
      )}

      <PhotoViewer
        photos={ready}
        openId={open}
        onOpenChange={(id) => setOpen(id)}
        albumName={(id) =>
          id ? (subEvents.find((item) => item.id === id)?.name ?? null) : t('wholeEvent')
        }
      />
    </div>
  );
}

function Tile({ item, onOpen }: { item: Media; onOpen: () => void }) {
  const t = useTranslations('gallery');
  if (item.status === 'ready' && item.urls) {
    return (
      <LiveRow entityId={item.id} className="rounded-control">
        <button
          type="button"
          onClick={onOpen}
          className="block aspect-square w-full overflow-hidden rounded-control bg-surface-muted"
          aria-label={item.caption ?? t('photoBy', { name: item.uploadedBy ?? t('someone') })}
          data-testid="photo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- already resized WebP from storage */}
          <img
            src={item.urls.thumb}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-(--dur-base) ease-(--ease-out) hover:scale-[1.03]"
          />
        </button>
      </LiveRow>
    );
  }
  return (
    <div
      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-control bg-surface-muted p-2 text-center text-caption text-fg-secondary"
      data-testid={item.status === 'pending' ? 'photo-processing' : 'photo-failed'}
    >
      {item.status === 'pending' ? (
        <>
          <Loader2 aria-hidden className="size-5 animate-spin reduce-motion:animate-none" />
          {t('processing')}
        </>
      ) : (
        <>
          <ImageOff aria-hidden className="size-5" />
          {t('failed')}
        </>
      )}
    </div>
  );
}
