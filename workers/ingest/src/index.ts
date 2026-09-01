import { getNewsSourceAdapter } from '@toneyarthi/news-sources';
import { validateAndNormalizeArticle } from '@toneyarthi/shared';
import { createLogger } from '@toneyarthi/shared/observability';
import type { QueueJobPayload, RawNewsArticle } from '@toneyarthi/types';

const service = 'ingest';

export interface Env {
  DB: D1Database;
  NEWS_QUEUE: Queue<QueueJobPayload>;
  ENVIRONMENT?: string;
  INGEST_TRIGGER_SECRET?: string;
  RELEASE?: string;
}

export interface SourceRow {
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

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(
      /(authorization|api[-_ ]?key|token|secret|password)\s*[:=]\s*\S+/gi,
      '$1=[REDACTED]',
    )
    .replace(/https?:\/\/\S+/gi, '[URL_REDACTED]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 500);
}

function logSummary(summary: IngestSummary | SourceSummary) {
  if ('sources' in summary)
    return { ...summary, sources: summary.sources.map(logSummary) };
  return {
    sourceId: summary.sourceId,
    slug: summary.slug,
    priority: summary.priority,
    fetched: summary.fetched,
    accepted: summary.accepted,
    duplicates: summary.duplicates,
    invalid: summary.invalid,
    queued: summary.queued,
    durationMs: summary.durationMs,
    errorCount: summary.errors.length,
  };
}

export async function insertCandidate(
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
    'SELECT id FROM articles WHERE canonical_url = ?1 OR content_hash = ?2 LIMIT 1',
  )
    .bind(record.canonicalUrl, fingerprint)
    .first<{ id: string }>();
  if (existing) {
    // Preserve provenance even when the article row is an exact duplicate. A
    // source URL is never discarded merely because its content was syndicated.
    await env.DB.prepare(
      `INSERT OR IGNORE INTO article_sources
        (article_id, source_id, source_url, source_article_id, fetched_at,
         original_title, original_published_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
      .bind(
        existing.id,
        source.id,
        record.canonicalUrl,
        fingerprint,
        record.fetchedAt,
        record.title,
        record.publishedAt ?? null,
      )
      .run();
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
        // Source text is transient processing material, not a publication copy.
        // Bound it here and erase it as soon as extraction succeeds.
        record.content?.slice(0, 12_000) ?? null,
        record.author ?? null,
        // A feed image URL is not evidence of reuse rights. Editorial image
        // tooling may populate this only alongside an article_images record.
        null,
        record.language,
        fingerprint,
        record.publishedAt ?? null,
      ),
      env.DB.prepare(
        `INSERT INTO article_sources
          (article_id, source_id, source_url, source_article_id, fetched_at,
           original_title, original_published_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      ).bind(
        articleId,
        source.id,
        record.canonicalUrl,
        fingerprint,
        record.fetchedAt,
        record.title,
        record.publishedAt ?? null,
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
        summary.errors.push(safeError(error));
      }
    }
    await env.DB.prepare(
      "UPDATE sources SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_success_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_error = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
    )
      .bind(source.id)
      .run();
  } catch (error) {
    const message = safeError(error);
    summary.errors.push(message);
    await env.DB.prepare(
      "UPDATE sources SET last_error=?2,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?1",
    )
      .bind(source.id, message)
      .run();
  }
  summary.durationMs = Date.now() - started;
  createLogger({
    service,
    environment: env.ENVIRONMENT,
    release: env.RELEASE,
  }).event(
    'ingest.source.completed',
    summary.errors.length ? 'warn' : 'info',
    logSummary(summary),
  );
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
  createLogger({
    service,
    environment: env.ENVIRONMENT,
    release: env.RELEASE,
  }).event('ingest.run.completed', 'info', logSummary(summary));
  return summary;
}

function authorized(request: Request, secret: string): boolean {
  const supplied = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  let mismatch = supplied.length ^ expected.length;
  for (
    let index = 0;
    index < Math.max(supplied.length, expected.length);
    index++
  )
    mismatch |=
      (supplied.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  return mismatch === 0;
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
