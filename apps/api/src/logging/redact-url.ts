import { createHash } from 'node:crypto';

const TOKEN_SEGMENT = /\/(invites|member-invites)\/([^/?#]+)/g;

/** Link tokens never reach logs: replace them with a short hash prefix (APIDesign "Link tokens"). */
export function redactUrl(url: string): string {
  return url.replace(TOKEN_SEGMENT, (_match, prefix: string, token: string) => {
    const hash = createHash('sha256').update(token).digest('hex').slice(0, 8);
    return `/${prefix}/~${hash}`;
  });
}
