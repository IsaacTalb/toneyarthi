import { isQueueJobPayload, type QueueJobPayload } from '@toneyarthi/types';

const service = 'ai-processor';

interface Env {
  DB: D1Database;
  TTS_QUEUE: Queue<QueueJobPayload>;
}

interface JobState {
  status: string;
  attempts: number;
  max_attempts: number;
}

async function claimJob(
  env: Env,
  payload: QueueJobPayload,
): Promise<'claimed' | 'completed' | 'unavailable'> {
  const claimed = await env.DB.prepare(
    `UPDATE processing_jobs
       SET status = 'processing', attempts = attempts + 1,
           started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), error_message = NULL
     WHERE id = ?1 AND article_id = ?2 AND job_type = ?3
       AND status = 'pending' AND attempts < max_attempts
       AND available_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  )
    .bind(payload.jobId, payload.articleId, payload.type)
    .run();
  if (claimed.meta.changes === 1) return 'claimed';

  const state = await env.DB.prepare(
    'SELECT status, attempts, max_attempts FROM processing_jobs WHERE id = ?1 AND article_id = ?2 AND job_type = ?3',
  )
    .bind(payload.jobId, payload.articleId, payload.type)
    .first<JobState>();
  return state?.status === 'completed' ? 'completed' : 'unavailable';
}

async function recordFailure(env: Env, jobId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await env.DB.prepare(
    `UPDATE processing_jobs
       SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
           error_message = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?1 AND status = 'processing'`,
  )
    .bind(jobId, message.slice(0, 4000))
    .run();
}

async function processMessage(message: Message<unknown>, env: Env) {
  if (!isQueueJobPayload(message.body) || message.body.type === 'audio') {
    console.error(JSON.stringify({ event: 'queue.message.invalid', service }));
    message.ack();
    return;
  }
  const payload = message.body;
  const claim = await claimJob(env, payload);
  if (claim === 'completed') {
    message.ack();
    return;
  }
  if (claim !== 'claimed') {
    message.retry({ delaySeconds: 5 });
    return;
  }

  try {
    // Processing is intentionally skeletal. Feature implementations replace this
    // result while retaining the claim/finalize transaction boundaries.
    await env.DB.prepare(
      `UPDATE processing_jobs SET status = 'completed', result = ?2,
         completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?1 AND status = 'processing'`,
    )
      .bind(
        payload.jobId,
        JSON.stringify({ processor: service, skeletal: true }),
      )
      .run();
    message.ack();
  } catch (error) {
    await recordFailure(env, payload.jobId, error);
    message.retry({ delaySeconds: 10 });
  }
}

export default {
  async fetch(request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/' && url.pathname !== '/health')
      return Response.json({ error: 'Not found', service }, { status: 404 });
    return Response.json({ status: 'ok', service });
  },
  async queue(batch, env): Promise<void> {
    await Promise.all(
      batch.messages.map((message) => processMessage(message, env)),
    );
  },
} satisfies ExportedHandler<Env>;
