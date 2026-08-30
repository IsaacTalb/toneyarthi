import { createGeminiClient } from '@toneyarthi/ai';
import {
  buildExtractionPrompt,
  EXTRACTION_PROMPT_ID,
  EXTRACTION_PROMPT_VERSION,
  EXTRACTION_SCHEMA,
  isExtractionOutput,
  type ExtractionArticle,
  type ExtractionOutput,
} from '@toneyarthi/prompts';

const service = 'ai-processor';

interface Env {
  DB: D1Database;
  GEMINI_API_KEY: string;
  GEMINI_TEXT_MODEL: string;
  GEMINI_TTS_MODEL?: string;
}

interface ExtractionJobPayload {
  version: 1;
  jobId: string;
  clusterId: string;
  type: 'extract';
}
interface JobState {
  status: string;
}

function isExtractionJob(value: unknown): value is ExtractionJobPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const item = value as Record<string, unknown>;
  return (
    Object.keys(item).length === 4 &&
    item.version === 1 &&
    item.type === 'extract' &&
    typeof item.jobId === 'string' &&
    item.jobId.length > 0 &&
    typeof item.clusterId === 'string' &&
    item.clusterId.length > 0
  );
}

async function claimJob(
  env: Env,
  payload: ExtractionJobPayload,
): Promise<'claimed' | 'completed' | 'unavailable'> {
  const result = await env.DB.prepare(
    `UPDATE processing_jobs SET status = 'processing', attempts = attempts + 1,
       started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), error_message = NULL
     WHERE id = ?1 AND cluster_id = ?2 AND job_type = 'extract' AND status = 'pending'`,
  )
    .bind(payload.jobId, payload.clusterId)
    .run();
  if (result.meta.changes === 1) return 'claimed';
  const state = await env.DB.prepare(
    "SELECT status FROM processing_jobs WHERE id = ?1 AND cluster_id = ?2 AND job_type = 'extract'",
  )
    .bind(payload.jobId, payload.clusterId)
    .first<JobState>();
  return state?.status === 'completed' ? 'completed' : 'unavailable';
}

async function loadClusterArticles(
  env: Env,
  clusterId: string,
): Promise<ExtractionArticle[]> {
  const rows = await env.DB.prepare(
    `SELECT a.id, a.title, COALESCE(a.body, a.summary, '') AS body,
            a.canonical_url AS canonicalUrl, a.published_at AS publishedAt,
            COALESCE(group_concat(s.name, ', '), 'Unknown source') AS sourceName
       FROM story_cluster_articles sca
       JOIN articles a ON a.id = sca.article_id
       LEFT JOIN article_sources ars ON ars.article_id = a.id
       LEFT JOIN sources s ON s.id = ars.source_id
      WHERE sca.cluster_id = ?1
      GROUP BY a.id
      ORDER BY sca.is_primary DESC, sca.added_at ASC`,
  )
    .bind(clusterId)
    .all<ExtractionArticle>();
  return rows.results;
}

async function failAi(env: Env, jobId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await env.DB.prepare(
    `UPDATE processing_jobs SET status = 'FAILED_AI', error_message = ?2,
       completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?1 AND status = 'processing'`,
  )
    .bind(jobId, message.slice(0, 4000))
    .run();
}

async function processMessage(
  message: Message<unknown>,
  env: Env,
): Promise<void> {
  if (!isExtractionJob(message.body)) {
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
    const articles = await loadClusterArticles(env, payload.clusterId);
    if (articles.length === 0)
      throw new Error('Story cluster contains no normalized articles');
    const articleIds = new Set(articles.map(({ id }) => id));
    const client = createGeminiClient({
      GEMINI_API_KEY: env.GEMINI_API_KEY,
      GEMINI_TEXT_MODEL: env.GEMINI_TEXT_MODEL,
      GEMINI_TTS_MODEL: env.GEMINI_TTS_MODEL ?? env.GEMINI_TEXT_MODEL,
    });
    // Transport retries happen only inside this bounded client policy. Invalid
    // JSON or schema output is terminal for this job and is never queue-retried.
    const output = await client.generateStructured({
      prompt: buildExtractionPrompt(payload.clusterId, articles),
      schema: EXTRACTION_SCHEMA,
      validate: (value: unknown): value is ExtractionOutput =>
        isExtractionOutput(value, articleIds),
    });
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO story_extractions (job_id, cluster_id, prompt_id, prompt_version, model, output)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      ).bind(
        payload.jobId,
        payload.clusterId,
        EXTRACTION_PROMPT_ID,
        EXTRACTION_PROMPT_VERSION,
        env.GEMINI_TEXT_MODEL,
        JSON.stringify(output),
      ),
      env.DB.prepare(
        `UPDATE processing_jobs SET status = 'completed', result = ?2,
           completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1 AND status = 'processing'`,
      ).bind(
        payload.jobId,
        JSON.stringify({ extractionVersion: EXTRACTION_PROMPT_VERSION }),
      ),
    ]);
    message.ack();
  } catch (error) {
    await failAi(env, payload.jobId, error);
    message.ack();
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
