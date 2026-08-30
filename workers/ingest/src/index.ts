import { getNewsSourceAdapter } from '@toneyarthi/news-sources';
import type { QueueJobPayload, RawNewsArticle } from '@toneyarthi/types';

const service = 'ingest';
const TRACKING_PARAMETERS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'utm_campaign',
  'utm_content',
  'utm_medium',
  'utm_source',
  'utm_term',
]);

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

export function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('Article URL must use HTTP or HTTPS');
  }
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  for (const name of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMETERS.has(name.toLowerCase()))
      url.searchParams.delete(name);
  }
  url.searchParams.sort();
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeRecord(record: RawNewsArticle): RawNewsArticle | undefined {
  const title = record.title?.trim();
  const language = record.language?.trim();
  if (
    !title ||
    !language ||
    !record.fetchedAt ||
    Number.isNaN(Date.parse(record.fetchedAt))
  ) {
    return undefined;
  }
  if (record.publishedAt && Number.isNaN(Date.parse(record.publishedAt)))
    return undefined;
  try {
    return {
      ...record,
      title,
      language,
      canonicalUrl: canonicalizeUrl(record.canonicalUrl),
    };
  } catch {
    return undefined;
  }
}

async function insertCandidate(
  env: Env,
  source: SourceRow,
  record: RawNewsArticle,
  seen: Set<string>,
): Promise<'inserted' | 'duplicate'> {
  // This fingerprint catches syndicated content whose canonical URLs differ. URL is
  // separately unique in D1 and in the in-memory set below.
  const fingerprint = await sha256(
    [
      record.title.toLocaleLowerCase(),
      record.publishedAt ?? '',
      record.content ?? record.summary ?? '',
    ]
      .map((part) => part.trim().replace(/\s+/g, ' '))
      .join('\n'),
  );
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
      const record = normalizeRecord(candidate);
      if (!record) {
        summary.invalid++;
        continue;
      }
      try {
        const result = await insertCandidate(env, source, record, seen);
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
