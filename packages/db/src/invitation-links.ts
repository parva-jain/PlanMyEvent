import { createHash, createHmac } from 'node:crypto';

/**
 * Invitation link tokens are derived, not stored (APIDesign "Link tokens"):
 * base64url(HMAC-SHA256(key, id:tokenVersion)). The database keeps only SHA-256 of the token,
 * so a leaked database can't produce working links, and organizers can re-share a link
 * because the server can derive it again. Bumping token_version kills the old one.
 */
export function invitationToken(key: string, invitationId: string, tokenVersion: number): string {
  return createHmac('sha256', key).update(`${invitationId}:${tokenVersion}`).digest('base64url');
}

/** SHA-256 of a link token: what invitations.token_hash holds and lookups compare. */
export function hashLinkToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}
