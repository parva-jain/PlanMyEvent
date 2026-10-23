import { jobId } from '@pme/contracts';

export const SAMPLE_QUEUE = 'sample';

export interface SampleJobData {
  message: string;
}

/** Deterministic, so a re-delivered job never runs twice (CLAUDE.md rule 7, decision 005). */
export const sampleJobId = (name: string) => jobId('sample', name);
