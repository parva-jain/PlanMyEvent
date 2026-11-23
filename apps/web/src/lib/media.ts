'use client';

import type {
  CreateUpload,
  Media,
  MediaPage,
  MediaUrl,
  UpdateMedia,
  UploadTicket,
} from '@pme/contracts';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { apiFetch, ApiError } from './api';

export const mediaKeys = {
  /** Under the event's key, so the live fallback poll and reconnects refresh it too. */
  all: (eventId: string) => ['events', eventId, 'media'] as const,
  list: (eventId: string, album: string) => ['events', eventId, 'media', 'list', album] as const,
  url: (eventId: string, mediaId: string) => ['events', eventId, 'media', 'url', mediaId] as const,
};

const E = (eventId: string) => `/v1/events/${eventId}` as const;

/** GET E/media (gallery), newest first, 48 at a time. `album`: '' all, 'event', or a sub-event id. */
export function useGallery(eventId: string, album: string) {
  return useInfiniteQuery({
    queryKey: mediaKeys.list(eventId, album),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ kind: 'gallery' });
      if (album) params.set('subEventId', album);
      if (pageParam) params.set('cursor', pageParam);
      return apiFetch<MediaPage>(`${E(eventId)}/media?${params.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => (page.hasMore ? page.nextCursor : null),
    // Processing finishes in a few seconds; entity.changed brings it, this is the fallback.
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => page.data.some((item) => item.status === 'pending'))
        ? 5_000
        : false,
  });
}

/** One media row (e.g. a receipt), refreshed while it's processing. */
export function useMedia(eventId: string, mediaId: string | null) {
  return useQuery({
    queryKey: [...mediaKeys.all(eventId), 'one', mediaId],
    queryFn: () => apiFetch<Media>(`${E(eventId)}/media/${mediaId}`),
    enabled: mediaId !== null,
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 3_000 : false),
  });
}

/** A short-lived link to a private file (a receipt); fetched when asked for. */
export const fetchMediaUrl = (eventId: string, mediaId: string) =>
  apiFetch<MediaUrl>(`${E(eventId)}/media/${mediaId}/url`);

/** PUT the file to the presigned URL with upload progress (fetch can't report it). */
function put(ticket: UploadTicket, file: File, onProgress: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', ticket.uploadUrl);
    for (const [name, value] of Object.entries(ticket.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, null));
    xhr.onerror = () => reject(new ApiError(0, null));
    xhr.send(file);
  });
}

export type UploadMime = CreateUpload['mime'];

/**
 * The whole upload (SystemDesign 5.7): ask for a presigned URL, PUT the file straight to
 * storage with progress, then confirm. Returns the media row, still processing.
 */
export async function uploadFile(
  eventId: string,
  file: File,
  input: Omit<CreateUpload, 'mime' | 'bytes'>,
  onProgress: (fraction: number) => void,
): Promise<Media> {
  const ticket = await apiFetch<UploadTicket>(`${E(eventId)}/uploads`, {
    method: 'POST',
    body: { ...input, mime: file.type as UploadMime, bytes: file.size },
  });
  await put(ticket, file, onProgress);
  return apiFetch<Media>(`${E(eventId)}/media/${ticket.mediaId}/complete`, { method: 'POST' });
}

export const refreshMedia = (queryClient: QueryClient, eventId: string) =>
  queryClient.invalidateQueries({ queryKey: mediaKeys.all(eventId) });

export function useUpdateMedia(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ media, changes }: { media: Media; changes: UpdateMedia }) =>
      apiFetch<Media>(`${E(eventId)}/media/${media.id}`, {
        method: 'PATCH',
        body: changes,
        headers: { 'If-Match': `"${media.version}"` },
      }),
    onSettled: () => refreshMedia(queryClient, eventId),
  });
}

export function useDeleteMedia(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (media: Media) =>
      apiFetch<null>(`${E(eventId)}/media/${media.id}`, {
        method: 'DELETE',
        headers: { 'If-Match': `"${media.version}"` },
      }),
    onSettled: () => refreshMedia(queryClient, eventId),
  });
}
