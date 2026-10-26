/** Base URL of the NestJS API (apps/web/.env.example). Public: the browser calls it directly. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** URL of an API path, e.g. `apiUrl('/v1/health/ready')`. */
export function apiUrl(path: `/${string}`): string {
  return `${API_URL}${path}`;
}
