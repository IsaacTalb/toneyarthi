import { isQueueJobPayload, type QueueJobPayload } from '@toneyarthi/types';

const service = 'audio-processor';

interface Env {
  DB: D1Database;
}

async function claimJob(env: Env, payload: QueueJobPayload) {
  const result = await env.DB.prepare(
    `UPDATE processing_jobs
       SET status = 'processing', attempts = attempts + 1,
           started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), error_message = NULL
     WHERE id = ?1 AND article_id = ?2 AND job_type = 'audio'
       AND status = 'pending' AND attempts < max_attempts
       AND available_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  )
    .bind(payload.jobId, payload.articleId)
    .run();
  if (result.meta.changes === 1) return 'claimed';
  const row = await env.DB.prepare(
    "SELECT status FROM processing_jobs WHERE id = ?1 AND article_id = ?2 AND job_type = 'audio'",
  )
    .bind(payload.jobId, payload.articleId)
    .first<{ status: string }>();
  return row?.status === 'completed' ? 'completed' : 'unavailable';
}

async function processMessage(message: Message<unknown>, env: Env) {
  if (!isQueueJobPayload(message.body) || message.body.type !== 'audio') {
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
    // Audio generation and R2 persistence will replace this skeletal result.
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
    const detail = error instanceof Error ? error.message : String(error);
    await env.DB.prepare(
      `UPDATE processing_jobs
         SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
             error_message = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?1 AND status = 'processing'`,
    )
      .bind(payload.jobId, detail.slice(0, 4000))
      .run();
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
