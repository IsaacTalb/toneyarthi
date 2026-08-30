import { getNewsSourceAdapter } from '@toneyarthi/news-sources';
import { validateAndNormalizeArticle } from '@toneyarthi/shared';
import type { QueueJobPayload, RawNewsArticle } from '@toneyarthi/types';

const service = 'ingest';

interface Env {
  DB: D1Database;
  NEWS_QUEUE: Queue<QueueJobPayload>;
  ENVIRONMENT?: string;
  INGEST_TRIGGER_SECRET?: string;
}

interface SourceRow {
  id: string;
  slug: string;
  priority: number;
}

export interface SourceSummary {
  sourceId: string;
  slug: string;
  priority: number;
  fetched: number;
  accepted: number;
  duplicates: number;
  invalid: number;
  queued: number;
  errors: string[];
  durationMs: number;
}

export interface IngestSummary {
  startedAt: string;
  completedAt: string;
  sources: SourceSummary[];
}

async function insertCandidate(
  env: Env,
  source: SourceRow,
  record: RawNewsArticle,
  fingerprint: string,
  seen: Set<string>,
): Promise<'inserted' | 'duplicate'> {
  // This fingerprint catches syndicated content whose canonical URLs differ. URL is
  // separately unique in D1 and in the in-memory set below.
  if (seen.has(record.canonicalUrl) || seen.has(fingerprint))
    return 'duplicate';

  const existing = await env.DB.prepare(
    'SELECT 1 FROM articles WHERE canonical_url = ?1 OR content_hash = ?2 LIMIT 1',
  )
    .bind(record.canonicalUrl, fingerprint)
    .first();
  if (existing) {
    seen.add(record.canonicalUrl).add(fingerprint);
    return 'duplicate';
  }

  const articleId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  try {
    // D1 batch statements commit atomically. Database UNIQUE constraints remain the
    // final defense when concurrent cron/manual runs race after the query above.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO articles
          (id, canonical_url, title, summary, body, author, image_url, language,
           status, content_hash, published_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'draft', ?9, ?10)`,
      ).bind(
        articleId,
        record.canonicalUrl,
        record.title,
        record.summary ?? null,
        record.content ?? null,
        record.author ?? null,
        record.imageUrl ?? null,
        record.language,
        fingerprint,
        record.publishedAt ?? null,
      ),
      env.DB.prepare(
        `INSERT INTO article_sources
          (article_id, source_id, source_url, source_article_id, fetched_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      ).bind(
        articleId,
        source.id,
        record.canonicalUrl,
        fingerprint,
        record.fetchedAt,
      ),
      env.DB.prepare(
        `INSERT INTO processing_jobs
          (id, article_id, job_type, payload, deduplication_key, priority)
         VALUES (?1, ?2, 'ingest', ?3, ?4, ?5)`,
      ).bind(
        jobId,
        articleId,
        JSON.stringify({ articleId, sourceId: source.id }),
        `ingest:${articleId}`,
        source.priority,
      ),
    ]);
  } catch (error) {
    if (error instanceof Error && /UNIQUE|constraint/i.test(error.message))
      return 'duplicate';
    throw error;
  }

  seen.add(record.canonicalUrl).add(fingerprint);
  await env.NEWS_QUEUE.send({ version: 1, jobId, articleId, type: 'ingest' });
  return 'inserted';
}

async function processSource(
  env: Env,
  source: SourceRow,
): Promise<SourceSummary> {
  const started = Date.now();
  const summary: SourceSummary = {
    sourceId: source.id,
    slug: source.slug,
    priority: source.priority,
    fetched: 0,
    accepted: 0,
    duplicates: 0,
    invalid: 0,
    queued: 0,
    errors: [],
    durationMs: 0,
  };
  try {
    const adapter = getNewsSourceAdapter(source.slug);
    const records = await adapter.fetch();
    summary.fetched = records.length;
    const seen = new Set<string>();
    for (const candidate of records) {
      const validation = await validateAndNormalizeArticle(candidate, {
        seenUrls: seen,
        seenHashes: seen,
      });
      if (!validation.accepted) {
        if (validation.code === 'duplicate') summary.duplicates++;
        else summary.invalid++;
        // Keep persisted/logged diagnostics useful and bounded without retaining raw input.
        if (summary.errors.length < 100)
          summary.errors.push(`${validation.code}: ${validation.message}`);
        continue;
      }
      const record = validation.article;
      try {
        const result = await insertCandidate(
          env,
          source,
          record,
          validation.contentHash,
          seen,
        );
        if (result === 'duplicate') summary.duplicates++;
        else {
          summary.accepted++;
          summary.queued++;
        }
      } catch (error) {
        summary.errors.push(
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    await env.DB.prepare(
      "UPDATE sources SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
    )
      .bind(source.id)
      .run();
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : String(error));
  }
  summary.durationMs = Date.now() - started;
  console.log(JSON.stringify({ event: 'ingest.source.completed', ...summary }));
  return summary;
}

export async function runIngest(env: Env): Promise<IngestSummary> {
  const startedAt = new Date().toISOString();
  const result = await env.DB.prepare(
    'SELECT id, slug, priority FROM sources WHERE is_active = 1 ORDER BY priority DESC, slug ASC',
  ).all<SourceRow>();
  const sources: SourceSummary[] = [];
  // Deliberately preserve configured priority order; errors are contained by processSource.
  for (const source of result.results)
    sources.push(await processSource(env, source));
  const summary = { startedAt, completedAt: new Date().toISOString(), sources };
  console.log(JSON.stringify({ event: 'ingest.run.completed', ...summary }));
  return summary;
}

function authorized(request: Request, secret: string): boolean {
  const authorization = request.headers.get('authorization');
  return (
    authorization === `Bearer ${secret}` ||
    request.headers.get('x-ingest-trigger-secret') === secret
  );
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return Response.json({ status: 'ok', service });
    }
    if (url.pathname !== '/trigger' || request.method !== 'POST') {
      return Response.json({ error: 'Not found', service }, { status: 404 });
    }
    if (env.ENVIRONMENT !== 'development') {
      return Response.json({ error: 'Not found', service }, { status: 404 });
    }
    if (
      !env.INGEST_TRIGGER_SECRET ||
      !authorized(request, env.INGEST_TRIGGER_SECRET)
    ) {
      return Response.json({ error: 'Unauthorized', service }, { status: 401 });
    }
    return Response.json(await runIngest(env));
  },
  async scheduled(_controller, env, context): Promise<void> {
    context.waitUntil(runIngest(env));
  },
} satisfies ExportedHandler<Env>;
