import type { Problem } from '@pme/contracts';

/** Base URL of the NestJS API (apps/web/.env.example). Public: the browser calls it directly. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** URL of an API path, e.g. `apiUrl('/v1/health/ready')`. */
export function apiUrl(path: `/${string}`): string {
  return `${API_URL}${path}`;
}

/** A non-2xx answer from the API, carrying its problem+json body (CLAUDE.md rule 9). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: (Problem & { fields?: { path: string; message: string }[] }) | null,
  ) {
    super(problem?.title ?? `Request failed with ${status}`);
    this.name = 'ApiError';
  }
}

/** Request ids this tab sent lately, newest last: live signals for them are our own. */
const ownRequests = new Set<string>();
const MAX_OWN_REQUESTS = 200;

/** A fresh X-Request-Id, remembered so the socket can skip the signals it causes. */
export function newRequestId(): string {
  const id = `web_${crypto.randomUUID()}`;
  ownRequests.add(id);
  // Sets iterate in insertion order: drop the oldest.
  if (ownRequests.size > MAX_OWN_REQUESTS) ownRequests.delete(ownRequests.values().next().value!);
  return id;
}

/** Whether a live signal came from a request this tab made (APIDesign "Real-time contract"). */
export const isOwnRequest = (requestId: string | null) =>
  requestId !== null && ownRequests.has(requestId);

/**
 * JSON request to the API with the session cookie. The cookie belongs to the API's host,
 * so every call is cross-origin with `credentials: 'include'` (CORS allows the web origin).
 * Writes carry an X-Request-Id (reads cause no signals, and skip the CORS preflight a custom
 * header would add); pass `requestId` to know which activity entries a write made.
 */
export async function apiFetch<T>(
  path: `/${string}`,
  init: Omit<RequestInit, 'body'> & { body?: unknown; requestId?: string } = {},
): Promise<T> {
  const { body, headers, requestId, ...rest } = init;
  const write = rest.method !== undefined && !['GET', 'HEAD'].includes(rest.method);
  const res = await fetch(apiUrl(path), {
    ...rest,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(write ? { 'X-Request-Id': requestId ?? newRequestId() } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const problem = (await res.json().catch(() => null)) as ApiError['problem'];
    throw new ApiError(res.status, problem);
  }
  // 204 No Content (deletes) has no body.
  return (res.status === 204 ? null : await res.json()) as T;
}
