import { z } from 'zod';

import { ContactImportResultSchema } from './guests.js';

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

// ---- Job status (APIDesign "Async jobs") -----------------------------------------------------

export const JOB_KINDS = ['contacts.import'] as const;
export const JobKindSchema = z.enum(JOB_KINDS);
export type JobKind = z.infer<typeof JobKindSchema>;

export const JobStateSchema = z.enum(['queued', 'running', 'succeeded', 'failed']);
export type JobState = z.infer<typeof JobStateSchema>;

/**
 * GET /v1/jobs/{jobId}, and the job.progress signal. Progress information only, kept in Redis
 * for a day: the real outcome is in Postgres and the normal endpoints.
 */
export const JobStatusSchema = z.object({
  jobId: z.uuid(),
  kind: JobKindSchema,
  eventId: z.uuid(),
  status: JobStateSchema,
  progress: z.object({ done: z.number().int(), total: z.number().int() }),
  result: ContactImportResultSchema.nullable(),
  /** Why it failed, for people. */
  error: z.string().nullable(),
});
export type JobStatus = z.infer<typeof JobStatusSchema>;

/** 202 Accepted body for an operation that runs as a job. */
export const JobAcceptedSchema = z.object({
  jobId: z.uuid(),
  status: JobStateSchema,
  statusUrl: z.string(),
});
export type JobAccepted = z.infer<typeof JobAcceptedSchema>;

/** Redis key of a job's status, with the user who started it (only they may read it). */
export const jobStatusKey = (id: string) => `job:${id}`;
export const JOB_STATUS_TTL_SECONDS = 24 * 60 * 60;
export const StoredJobStatusSchema = JobStatusSchema.extend({ userId: z.uuid() });
export type StoredJobStatus = z.infer<typeof StoredJobStatusSchema>;
