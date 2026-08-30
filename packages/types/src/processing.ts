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
