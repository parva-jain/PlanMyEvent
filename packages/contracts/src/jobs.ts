/**
 * Deterministic BullMQ job id (and outbox dedupe key) built from what the job is about,
 * e.g. `jobId('invite-email', invitationId, templateVersion)`.
 *
 * Parts are joined with '-' (decision 005): BullMQ rejects custom ids containing ':'
 * (today unless there are exactly three parts, in the next major always) and ids that
 * are plain integers. UUIDs contain only hex and '-', so ids stay unambiguous.
 */
export function jobId(...parts: [string, ...(string | number)[]]): string {
  const id = parts.map(String).join('-');
  if (id.includes(':')) {
    throw new Error(`Job id must not contain ':' (got "${id}")`);
  }
  if (/^\d+$/.test(id)) {
    throw new Error(`Job id must not be an integer (got "${id}")`);
  }
  return id;
}
