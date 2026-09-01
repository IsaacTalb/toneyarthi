import { createGeminiClient } from '@toneyarthi/ai';
import {
  buildBurmeseWritingPrompt,
  buildExtractionPrompt,
  BURMESE_WRITING_PROMPT_ID,
  BURMESE_WRITING_PROMPT_VERSION,
  BURMESE_WRITING_SCHEMA,
  EXTRACTION_PROMPT_ID,
  EXTRACTION_PROMPT_VERSION,
  EXTRACTION_SCHEMA,
  isExtractionOutput,
  isBurmeseWritingOutput,
  assessEditorialRisk,
  type BurmeseWritingOutput,
  type ExtractionArticle,
  type ExtractionOutput,
} from '@toneyarthi/prompts';

const service = 'ai-processor';

interface Env {
  DB: D1Database;
  GEMINI_API_KEY: string;
  GEMINI_TEXT_MODEL: string;
  GEMINI_TTS_MODEL?: string;
  PIPELINE_QUEUE: Queue;
}

interface StoryJobPayload {
  version: 1;
  jobId: string;
  clusterId: string;
  type: 'extract' | 'write';
}
interface JobState {
  status: string;
}

async function enqueuePendingWriting(
  env: Env,
  clusterId: string,
): Promise<void> {
  const job = await env.DB.prepare(
    `SELECT id FROM processing_jobs
      WHERE cluster_id = ?1 AND job_type = 'write' AND status = 'pending'
      ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(clusterId)
    .first<{ id: string }>();
  if (job)
    await env.PIPELINE_QUEUE.send({
      version: 1,
      jobId: job.id,
      clusterId,
      type: 'write',
    } satisfies StoryJobPayload);
}

function isStoryJob(value: unknown): value is StoryJobPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const item = value as Record<string, unknown>;
  return (
    Object.keys(item).length === 4 &&
    item.version === 1 &&
    (item.type === 'extract' || item.type === 'write') &&
    typeof item.jobId === 'string' &&
    item.jobId.length > 0 &&
    typeof item.clusterId === 'string' &&
    item.clusterId.length > 0
  );
}

async function claimJob(
  env: Env,
  payload: StoryJobPayload,
): Promise<'claimed' | 'completed' | 'unavailable'> {
  const result = await env.DB.prepare(
    `UPDATE processing_jobs SET status = 'processing', attempts = attempts + 1,
       started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), error_message = NULL
     WHERE id = ?1 AND cluster_id = ?2 AND job_type = ?3 AND status = 'pending'`,
  )
    .bind(payload.jobId, payload.clusterId, payload.type)
    .run();
  if (result.meta.changes === 1) return 'claimed';
  const state = await env.DB.prepare(
    'SELECT status FROM processing_jobs WHERE id = ?1 AND cluster_id = ?2 AND job_type = ?3',
  )
    .bind(payload.jobId, payload.clusterId, payload.type)
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
  if (!isStoryJob(message.body)) {
    console.error(JSON.stringify({ event: 'queue.message.invalid', service }));
    message.ack();
    return;
  }
  const payload = message.body;
  const claim = await claimJob(env, payload);
  if (claim === 'completed') {
    if (payload.type === 'extract') {
      try {
        await enqueuePendingWriting(env, payload.clusterId);
      } catch {
        message.retry({ delaySeconds: 5 });
        return;
      }
    }
    message.ack();
    return;
  }
  if (claim !== 'claimed') {
    message.retry({ delaySeconds: 5 });
    return;
  }

  try {
    if (payload.type === 'write') {
      await writeDraft(env, payload);
      message.ack();
      return;
    }
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
    const writingJobId = crypto.randomUUID();
    const risk = assessEditorialRisk(output);
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
      env.DB.prepare(
        `INSERT INTO processing_jobs (id, cluster_id, job_type, status, payload, deduplication_key)
         VALUES (?1, ?2, 'write', 'pending', ?3, ?4)`,
      ).bind(
        writingJobId,
        payload.clusterId,
        JSON.stringify({ extractionJobId: payload.jobId }),
        `write:${payload.clusterId}:${BURMESE_WRITING_PROMPT_VERSION}`,
      ),
      env.DB.prepare(
        `UPDATE story_clusters SET pipeline_state = 'WRITING',
           editorial_risk = ?2, editorial_confidence = ?3,
           risk_topics = ?4, risk_reasons = ?5,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1 AND pipeline_state = 'EXTRACTING'`,
      ).bind(
        payload.clusterId,
        risk.level,
        risk.confidence,
        JSON.stringify(risk.topics),
        JSON.stringify(risk.reasons),
      ),
      // The structured extraction is sufficient for synthesis and review.
      // Remove transient source copies promptly while retaining attribution metadata.
      env.DB.prepare(
        `UPDATE articles SET body = NULL
         WHERE id IN (SELECT article_id FROM story_cluster_articles WHERE cluster_id = ?1)`,
      ).bind(payload.clusterId),
    ]);
    try {
      await enqueuePendingWriting(env, payload.clusterId);
    } catch {
      // The database is authoritative. Redelivery observes the completed
      // extraction and retries only this idempotent hand-off.
      message.retry({ delaySeconds: 5 });
      return;
    }
    message.ack();
  } catch (error) {
    await failAi(env, payload.jobId, error);
    message.ack();
  }
}

interface StoredExtraction {
  id: string;
  output: string;
}

async function writeDraft(env: Env, payload: StoryJobPayload): Promise<void> {
  const stored = await env.DB.prepare(
    `SELECT id, output FROM story_extractions
      WHERE cluster_id = ?1 ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(payload.clusterId)
    .first<StoredExtraction>();
  if (!stored) throw new Error('Story cluster has no extracted facts');
  const extraction: unknown = JSON.parse(stored.output);
  if (!isExtractionOutput(extraction))
    throw new Error('Stored story extraction failed schema validation');
  const risk = assessEditorialRisk(extraction);

  const client = createGeminiClient({
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    GEMINI_TEXT_MODEL: env.GEMINI_TEXT_MODEL,
    GEMINI_TTS_MODEL: env.GEMINI_TTS_MODEL ?? env.GEMINI_TEXT_MODEL,
  });
  const draft = await client.generateStructured({
    prompt: buildBurmeseWritingPrompt(payload.clusterId, extraction),
    schema: BURMESE_WRITING_SCHEMA,
    validate: (value: unknown): value is BurmeseWritingOutput =>
      isBurmeseWritingOutput(value),
  });
  const generatedAt = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO story_drafts
         (job_id, cluster_id, extraction_id, title_mm, summary_mm, content_mm,
          prompt_id, prompt_version, model, generated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    ).bind(
      payload.jobId,
      payload.clusterId,
      stored.id,
      draft.title_mm,
      draft.summary_mm,
      draft.content_mm,
      BURMESE_WRITING_PROMPT_ID,
      BURMESE_WRITING_PROMPT_VERSION,
      env.GEMINI_TEXT_MODEL,
      generatedAt,
    ),
    env.DB.prepare(
      `UPDATE processing_jobs SET status = 'completed', result = ?2,
         completed_at = ?3, updated_at = ?3
       WHERE id = ?1 AND status = 'processing'`,
    ).bind(
      payload.jobId,
      JSON.stringify({
        draft: true,
        promptVersion: BURMESE_WRITING_PROMPT_VERSION,
      }),
      generatedAt,
    ),
    env.DB.prepare(
      `UPDATE story_clusters SET pipeline_state = ?3, updated_at = ?2
       WHERE id = ?1 AND pipeline_state = 'WRITING'`,
    ).bind(
      payload.clusterId,
      generatedAt,
      risk.requiresHumanReview ? 'NEEDS_REVIEW' : 'READY_FOR_REVIEW',
    ),
  ]);
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
