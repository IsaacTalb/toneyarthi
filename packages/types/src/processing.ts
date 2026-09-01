export const PROCESSING_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'needs_review',
] as const;

/** Every terminal and non-terminal state shared by processing services. */
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export interface ProcessingJob<TInput = unknown, TResult = unknown> {
  id: string;
  type: string;
  status: ProcessingStatus;
  input: TInput;
  result?: TResult;
  error?: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/** Version 1 of the deliberately small message passed between Workers. */
export interface QueueJobPayloadV1 {
  version: 1;
  jobId: string;
  articleId: string;
  type: QueueJobType;
}

export const QUEUE_JOB_TYPES = [
  'ingest',
  'translate',
  'summarize',
  'cluster',
  'audio',
] as const;

export type QueueJobType = (typeof QUEUE_JOB_TYPES)[number];
export type QueueJobPayload = QueueJobPayloadV1;

export const STORY_PIPELINE_STATES = [
  'EXTRACTING',
  'WRITING',
  'READY_FOR_REVIEW',
  'VERIFYING',
  'TTS_PENDING',
  'READY',
  'FAILED_TTS',
  'NEEDS_REVIEW',
  'FAILED_VERIFICATION',
  'PUBLISHED',
] as const;
export type StoryPipelineState = (typeof STORY_PIPELINE_STATES)[number];

/** Legal automatic transitions stop at editorial review; publishing is manual. */
export function nextAutomaticStoryState(
  state: StoryPipelineState,
  completedStage: 'extract' | 'write',
): StoryPipelineState | null {
  if (state === 'EXTRACTING' && completedStage === 'extract') return 'WRITING';
  if (state === 'WRITING' && completedStage === 'write')
    return 'READY_FOR_REVIEW';
  return null;
}

/** Automatic publication is forbidden for all stories; elevated stories additionally require review. */
export function canAutomaticallyPublish(risk: 'standard' | 'high'): false {
  void risk;
  return false;
}

const JOB_TYPES = new Set<string>(QUEUE_JOB_TYPES);

/** Validate untrusted Queue bodies without accepting extra or future versions. */
export function isQueueJobPayload(value: unknown): value is QueueJobPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const candidate = value as Record<string, unknown>;
  return (
    Object.keys(candidate).length === 4 &&
    candidate.version === 1 &&
    typeof candidate.jobId === 'string' &&
    candidate.jobId.trim().length > 0 &&
    typeof candidate.articleId === 'string' &&
    candidate.articleId.trim().length > 0 &&
    typeof candidate.type === 'string' &&
    JOB_TYPES.has(candidate.type)
  );
}
