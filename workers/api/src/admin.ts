import { sourceDefinitionRegistry } from '../../../packages/news-sources/src/definitions.ts';

const ID = /^[a-zA-Z0-9_-]{1,64}$/;
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{8,128}$/;
const PLAYLIST_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCHEDULE_TYPES = new Set(['manual', 'daily', 'weekly']);

export type EditorialAction =
  | 'publish'
  | 'unpublish'
  | 'reject'
  | 'regenerate_article'
  | 'rehumanize'
  | 'regenerate_audio';

interface AdminEnv {
  DB: D1Database;
  ADMIN_API_TOKEN?: string;
  PIPELINE_QUEUE: Queue;
  TTS_QUEUE: Queue;
}

interface PlaylistInput {
  titleMy?: unknown;
  slug?: unknown;
  description?: unknown;
  imageUrl?: unknown;
  isActive?: unknown;
  scheduleType?: unknown;
  articleIds?: unknown;
}

/** Playlist CRUD and eligible article discovery. Membership writes use one D1 transaction. */
export async function handleAdminPlaylists(
  request: Request,
  env: AdminEnv,
  url: URL,
) {
  if (!url.pathname.startsWith('/v1/admin/playlists')) return null;
  authenticate(request, env);
  if (url.pathname === '/v1/admin/playlists/articles') {
    if (request.method !== 'GET' && request.method !== 'HEAD') return null;
    const query = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
    const like = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    const result = await env.DB.prepare(
      `SELECT id,title,title_my titleMy,published_at publishedAt,audio_url audioUrl
       FROM articles WHERE status='published' AND published_at IS NOT NULL
       AND published_at<=datetime('now') AND audio_url IS NOT NULL
       AND (?1='' OR title LIKE ?2 ESCAPE '\\' OR COALESCE(title_my,'') LIKE ?2 ESCAPE '\\')
       ORDER BY published_at DESC,id DESC LIMIT 30`,
    )
      .bind(query, like)
      .all<Record<string, unknown>>();
    return { items: result.results };
  }
  const match = url.pathname.match(/^\/v1\/admin\/playlists(?:\/([^/]+))?$/);
  if (!match) return null;
  const encodedId = match[1];
  if (request.method === 'GET' || request.method === 'HEAD') {
    if (!encodedId) {
      const rows = await env.DB.prepare(
        `SELECT p.id,p.slug,p.title_my titleMy,p.description,p.image_url imageUrl,
        p.is_active isActive,p.schedule_type scheduleType,p.updated_at updatedAt,
        COUNT(pa.article_id) articleCount FROM playlists p LEFT JOIN playlist_articles pa
        ON pa.playlist_id=p.id GROUP BY p.id ORDER BY p.updated_at DESC LIMIT 50`,
      ).all<Record<string, unknown>>();
      return {
        items: rows.results.map((row) => ({
          ...row,
          isActive: Boolean(row.isActive),
        })),
      };
    }
    const id = decodeURIComponent(encodedId);
    if (!ID.test(id))
      throw new AdminError(400, 'INVALID_PLAYLIST_ID', 'Invalid playlist id');
    const playlist = await env.DB.prepare(
      `SELECT id,slug,title_my titleMy,description,image_url imageUrl,is_active isActive,
       schedule_type scheduleType FROM playlists WHERE id=?1`,
    )
      .bind(id)
      .first<Record<string, unknown>>();
    if (!playlist)
      throw new AdminError(404, 'PLAYLIST_NOT_FOUND', 'Playlist not found');
    const members = await env.DB.prepare(
      `SELECT a.id,a.title,a.title_my titleMy,a.published_at publishedAt,a.audio_url audioUrl
       FROM playlist_articles pa JOIN articles a ON a.id=pa.article_id
       WHERE pa.playlist_id=?1 ORDER BY pa.position LIMIT 100`,
    )
      .bind(id)
      .all<Record<string, unknown>>();
    return {
      ...playlist,
      isActive: Boolean(playlist.isActive),
      articles: members.results,
    };
  }
  if (request.method !== 'POST' && request.method !== 'PATCH') return null;
  if ((request.method === 'POST') === Boolean(encodedId)) return null;
  const body = await readPlaylistInput(request);
  const id = encodedId ? decodeURIComponent(encodedId) : crypto.randomUUID();
  if (!ID.test(id))
    throw new AdminError(400, 'INVALID_PLAYLIST_ID', 'Invalid playlist id');
  const articleIds = body.articleIds as string[];
  if (articleIds.length) {
    const placeholders = articleIds.map((_, i) => `?${i + 1}`).join(',');
    const eligible = await env.DB.prepare(
      `SELECT id FROM articles WHERE id IN (${placeholders}) AND status='published'
       AND published_at IS NOT NULL AND published_at<=datetime('now') AND audio_url IS NOT NULL`,
    )
      .bind(...articleIds)
      .all<{ id: string }>();
    if (eligible.results.length !== articleIds.length)
      throw new AdminError(
        422,
        'INELIGIBLE_ARTICLE',
        'Every article must be public and have audio',
      );
  }
  const now = new Date().toISOString();
  const statements =
    request.method === 'POST'
      ? [
          env.DB.prepare(
            `INSERT INTO playlists
       (id,slug,title,title_my,description,image_url,status,published_at,is_active,schedule_type,updated_at)
       VALUES (?1,?2,?3,?3,?4,?5,?6,?7,?8,?9,?10)`,
          ).bind(
            id,
            body.slug,
            body.titleMy,
            body.description,
            body.imageUrl,
            body.isActive ? 'published' : 'draft',
            body.isActive ? now : null,
            body.isActive ? 1 : 0,
            body.scheduleType,
            now,
          ),
        ]
      : [
          env.DB.prepare(
            `UPDATE playlists SET slug=?2,title=?3,title_my=?3,description=?4,
       image_url=?5,status=?6,published_at=CASE WHEN ?6='published' THEN COALESCE(published_at,?7) ELSE NULL END,
       is_active=?8,schedule_type=?9,updated_at=?7 WHERE id=?1`,
          ).bind(
            id,
            body.slug,
            body.titleMy,
            body.description,
            body.imageUrl,
            body.isActive ? 'published' : 'draft',
            now,
            body.isActive ? 1 : 0,
            body.scheduleType,
          ),
          env.DB.prepare(
            'DELETE FROM playlist_articles WHERE playlist_id=?1',
          ).bind(id),
        ];
  statements.push(
    ...articleIds.map((articleId, position) =>
      env.DB.prepare(
        'INSERT INTO playlist_articles (playlist_id,article_id,position) VALUES (?1,?2,?3)',
      ).bind(id, articleId, position),
    ),
  );
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message))
      throw new AdminError(
        409,
        'PLAYLIST_CONFLICT',
        'The slug or membership already exists',
      );
    throw error;
  }
  return { id };
}

async function readPlaylistInput(request: Request) {
  let value: PlaylistInput;
  try {
    value = (await request.json()) as PlaylistInput;
  } catch {
    throw new AdminError(400, 'INVALID_JSON', 'Expected a JSON body');
  }
  const titleMy = typeof value.titleMy === 'string' ? value.titleMy.trim() : '';
  const slug = typeof value.slug === 'string' ? value.slug.trim() : '';
  const description =
    typeof value.description === 'string' ? value.description.trim() : '';
  const imageUrl =
    typeof value.imageUrl === 'string' ? value.imageUrl.trim() : '';
  const scheduleType =
    typeof value.scheduleType === 'string' ? value.scheduleType : '';
  if (!titleMy || titleMy.length > 200)
    throw new AdminError(
      400,
      'INVALID_NAME',
      'Burmese name is required (maximum 200 characters)',
    );
  if (!PLAYLIST_SLUG.test(slug) || slug.length > 100)
    throw new AdminError(
      400,
      'INVALID_SLUG',
      'Use a lowercase, hyphenated slug',
    );
  if (description.length > 2000)
    throw new AdminError(400, 'INVALID_DESCRIPTION', 'Description is too long');
  if (imageUrl && (!/^https:\/\//.test(imageUrl) || imageUrl.length > 2048))
    throw new AdminError(400, 'INVALID_IMAGE', 'Image must be an HTTPS URL');
  if (!SCHEDULE_TYPES.has(scheduleType))
    throw new AdminError(400, 'INVALID_SCHEDULE', 'Invalid schedule type');
  if (
    !Array.isArray(value.articleIds) ||
    value.articleIds.length > 100 ||
    value.articleIds.some((id) => typeof id !== 'string' || !ID.test(id))
  )
    throw new AdminError(
      400,
      'INVALID_ARTICLES',
      'articleIds must contain at most 100 valid ids',
    );
  if (new Set(value.articleIds).size !== value.articleIds.length)
    throw new AdminError(
      409,
      'DUPLICATE_ARTICLE',
      'An article can only appear once',
    );
  return {
    titleMy,
    slug,
    description: description || null,
    imageUrl: imageUrl || null,
    isActive: value.isActive === true,
    scheduleType,
    articleIds: value.articleIds,
  };
}

const JOB_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'FAILED_AI',
  'FAILED_TTS',
] as const;
const JOB_TYPES = [
  'ingest',
  'translate',
  'summarize',
  'cluster',
  'extract',
  'write',
  'audio',
] as const;
const RETRYABLE = new Set(['failed', 'FAILED_AI', 'FAILED_TTS']);

export function sanitizeError(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(
      /\b(?:api[-_]?key|token|authorization|secret)\s*[:=]\s*(?:Bearer\s+)?\S+/gi,
      '[credential redacted]',
    )
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 500);
}

/** Authenticated operational metrics and a bounded, filterable job listing. */
export async function handleAdminProcessing(
  request: Request,
  env: AdminEnv,
  url: URL,
) {
  const retry = url.pathname.match(
    /^\/v1\/admin\/processing\/jobs\/([^/]+)\/retry$/,
  );
  if (retry) return handleJobRetry(request, env, retry[1]);
  if (url.pathname !== '/v1/admin/processing') return null;
  authenticate(request, env);
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const status = url.searchParams.get('status');
  const type = url.searchParams.get('type');
  if (status && !(JOB_STATUSES as readonly string[]).includes(status))
    throw new AdminError(400, 'INVALID_STATUS', 'Unknown processing status');
  if (type && !(JOB_TYPES as readonly string[]).includes(type))
    throw new AdminError(
      400,
      'INVALID_JOB_TYPE',
      'Unknown processing job type',
    );
  const rawPage = url.searchParams.get('page') ?? '1';
  if (!/^\d+$/.test(rawPage) || +rawPage < 1 || +rawPage > 10000)
    throw new AdminError(
      400,
      'INVALID_PAGE',
      'page must be between 1 and 10000',
    );
  const limit = 50,
    offset = (+rawPage - 1) * limit;
  const filters = `${status ? ' AND j.status=?1' : ''}${type ? ` AND j.job_type=?${status ? 2 : 1}` : ''}`;
  const bindings = [status, type].filter(Boolean);
  const [counts, failures, jobs] = await Promise.all([
    env.DB.prepare(
      `SELECT
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) queued,
      SUM(CASE WHEN status='processing' THEN 1 ELSE 0 END) processing,
      SUM(CASE WHEN status IN ('failed','FAILED_AI','FAILED_TTS') THEN 1 ELSE 0 END) failed
      FROM processing_jobs`,
    ).first<Record<string, number>>(),
    env.DB.prepare(
      `SELECT
      (SELECT COUNT(*) FROM sources WHERE last_error IS NOT NULL) sourceFailures,
      SUM(CASE WHEN status='FAILED_AI' THEN 1 ELSE 0 END) geminiFailures,
      SUM(CASE WHEN status='FAILED_TTS' THEN 1 ELSE 0 END) ttsFailures,
      (SELECT COUNT(*) FROM story_clusters WHERE pipeline_state IN ('READY_FOR_REVIEW','NEEDS_REVIEW','FAILED_VERIFICATION','FAILED_TTS')) reviewRequired,
      (SELECT COUNT(*) FROM story_clusters WHERE pipeline_state='PUBLISHED' AND date(published_at)=date('now')) publishedToday
      FROM processing_jobs`,
    ).first<Record<string, number>>(),
    env.DB.prepare(
      `SELECT j.id,j.article_id articleId,j.cluster_id clusterId,
      COALESCE(a.title,c.title,'Unattached job') article,j.job_type type,j.status,
      j.attempts,j.max_attempts maxAttempts,j.error_message error,
      j.created_at createdAt,j.started_at startedAt,j.completed_at completedAt,j.updated_at updatedAt
      FROM processing_jobs j LEFT JOIN articles a ON a.id=j.article_id
      LEFT JOIN story_clusters c ON c.id=j.cluster_id WHERE 1=1${filters}
      ORDER BY j.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    )
      .bind(...bindings)
      .all<Record<string, unknown>>(),
  ]);
  return {
    metrics: {
      queued: counts?.queued ?? 0,
      processing: counts?.processing ?? 0,
      failed: counts?.failed ?? 0,
      reviewRequired: failures?.reviewRequired ?? 0,
      publishedToday: failures?.publishedToday ?? 0,
      sourceFailures: failures?.sourceFailures ?? 0,
      geminiFailures: failures?.geminiFailures ?? 0,
      ttsFailures: failures?.ttsFailures ?? 0,
    },
    items: jobs.results.map((job) => ({
      ...job,
      error: sanitizeError(job.error as string | null),
      retryable: RETRYABLE.has(job.status as string),
    })),
    page: +rawPage,
    hasMore: jobs.results.length === limit,
  };
}

async function handleJobRetry(
  request: Request,
  env: AdminEnv,
  encodedId: string,
) {
  if (request.method !== 'POST') return null;
  const actor = authenticate(request, env);
  let id: string;
  try {
    id = decodeURIComponent(encodedId);
  } catch {
    throw new AdminError(400, 'INVALID_JOB_ID', 'Invalid job id');
  }
  if (!ID.test(id))
    throw new AdminError(400, 'INVALID_JOB_ID', 'Invalid job id');
  const job = await env.DB.prepare(
    `SELECT id,article_id articleId,cluster_id clusterId,job_type type,status,payload,priority,max_attempts maxAttempts FROM processing_jobs WHERE id=?1`,
  )
    .bind(id)
    .first<{
      id: string;
      articleId: string | null;
      clusterId: string | null;
      type: string;
      status: string;
      payload: string;
      priority: number;
      maxAttempts: number;
    }>();
  if (!job)
    throw new AdminError(404, 'JOB_NOT_FOUND', 'Processing job not found');
  if (!RETRYABLE.has(job.status))
    throw new AdminError(
      409,
      'JOB_NOT_RETRYABLE',
      'Only failed terminal jobs can be retried',
    );
  const active = await env.DB.prepare(
    `SELECT id FROM processing_jobs WHERE job_type=?1 AND status IN ('pending','processing') AND COALESCE(article_id,'')=COALESCE(?2,'') AND COALESCE(cluster_id,'')=COALESCE(?3,'') LIMIT 1`,
  )
    .bind(job.type, job.articleId, job.clusterId)
    .first<{ id: string }>();
  if (active)
    throw new AdminError(
      409,
      'ACTIVE_JOB_EXISTS',
      'An active job already exists for this article and type',
    );
  const newId = crypto.randomUUID(),
    now = new Date().toISOString();
  try {
    const statements = [
      env.DB.prepare(
        `INSERT INTO processing_jobs (id,article_id,cluster_id,job_type,status,payload,deduplication_key,priority,max_attempts) VALUES (?1,?2,?3,?4,'pending',?5,?6,?7,?8)`,
      ).bind(
        newId,
        job.articleId,
        job.clusterId,
        job.type,
        job.payload,
        `retry:${id}:${newId}`,
        job.priority,
        job.maxAttempts,
      ),
      env.DB.prepare(
        `INSERT INTO processing_job_audit (job_id,retried_from_job_id,actor,action,details,created_at) VALUES (?1,?2,?3,'retry',?4,?5)`,
      ).bind(
        newId,
        id,
        actor,
        JSON.stringify({ previousStatus: job.status }),
        now,
      ),
    ];
    if (job.type === 'audio' && job.clusterId)
      statements.push(
        env.DB.prepare(
          `UPDATE story_clusters SET pipeline_state='TTS_PENDING',updated_at=?2 WHERE id=?1 AND pipeline_state='FAILED_TTS'`,
        ).bind(job.clusterId, now),
      );
    await env.DB.batch(statements);
  } catch (error) {
    if (
      error instanceof Error &&
      /duplicate active processing job/i.test(error.message)
    )
      throw new AdminError(
        409,
        'ACTIVE_JOB_EXISTS',
        'An active job already exists for this article and type',
      );
    throw error;
  }
  const message = {
    version: 1,
    jobId: newId,
    ...(job.clusterId
      ? { clusterId: job.clusterId }
      : { articleId: job.articleId }),
    type: job.type,
  };
  await (job.type === 'audio' ? env.TTS_QUEUE : env.PIPELINE_QUEUE).send(
    message,
  );
  return {
    jobId: newId,
    retriedFromJobId: id,
    status: 'pending',
    actor,
    enqueuedAt: now,
  };
}

interface SourceRow {
  id: string;
  slug: string;
  name: string;
  feedUrl: string | null;
  adapterType: string;
  isActive: number;
  priority: number;
  lastSuccess: string | null;
  lastError: string | null;
  articleCount: number;
}

/** Source administration is deliberately limited to compile-time adapters. */
export async function handleAdminSources(
  request: Request,
  env: AdminEnv,
  url: URL,
) {
  const match = url.pathname.match(/^\/v1\/admin\/sources(?:\/([^/]+))?$/);
  if (!match) return null;
  const actor = authenticate(request, env);
  if (!match[1]) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return null;
    const result = await env.DB.prepare(
      `SELECT s.id,s.slug,s.name,s.feed_url feedUrl,s.adapter_type adapterType,
       s.is_active isActive,s.priority,s.last_success_at lastSuccess,s.last_error lastError,
       COUNT(ars.id) articleCount FROM sources s LEFT JOIN article_sources ars ON ars.source_id=s.id
       GROUP BY s.id ORDER BY s.priority DESC,s.name LIMIT 100`,
    ).all<SourceRow>();
    return {
      items: result.results.map((source) => ({
        ...source,
        isActive: source.isActive === 1,
      })),
    };
  }
  if (request.method !== 'PATCH') return null;
  let slug: string;
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    throw new AdminError(400, 'INVALID_SOURCE', 'Invalid source slug');
  }
  const definition = sourceDefinitionRegistry.get(slug);
  if (!definition)
    throw new AdminError(
      400,
      'UNKNOWN_SOURCE',
      'Source slug is not in the adapter registry',
    );
  const body = await sourceBody(request);
  if (
    body.adapterType !== undefined &&
    body.adapterType !== definition.adapterType
  )
    throw new AdminError(
      400,
      'INVALID_ADAPTER',
      'Adapter type is not allowed for this source',
    );
  if (body.feedUrl !== undefined && body.feedUrl !== definition.feedUrl)
    throw new AdminError(
      400,
      'INVALID_FEED',
      'Feed URL must match the registered source configuration',
    );
  const current = await env.DB.prepare(
    'SELECT id,slug,feed_url feedUrl,adapter_type adapterType,is_active isActive,priority FROM sources WHERE slug=?1',
  )
    .bind(slug)
    .first<SourceRow>();
  if (!current)
    throw new AdminError(404, 'SOURCE_NOT_FOUND', 'Source not found');
  const next = {
    isActive: body.isActive ?? current.isActive === 1,
    priority: body.priority ?? current.priority,
    feedUrl: body.feedUrl ?? current.feedUrl,
    adapterType: body.adapterType ?? current.adapterType,
  };
  const previous = { ...current, isActive: current.isActive === 1 };
  const changes = Object.fromEntries(
    Object.entries(next)
      .filter(
        ([key, value]) => value !== previous[key as keyof typeof previous],
      )
      .map(([key, value]) => [
        key,
        { from: previous[key as keyof typeof previous], to: value },
      ]),
  );
  if (!Object.keys(changes).length)
    throw new AdminError(409, 'NO_CHANGES', 'No source fields changed');
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE sources SET is_active=?2,priority=?3,feed_url=?4,adapter_type=?5,updated_at=?6 WHERE id=?1',
    ).bind(
      current.id,
      next.isActive ? 1 : 0,
      next.priority,
      next.feedUrl,
      next.adapterType,
      now,
    ),
    env.DB.prepare(
      'INSERT INTO source_admin_audit (source_id,source_slug,actor,changes,created_at) VALUES (?1,?2,?3,?4,?5)',
    ).bind(current.id, slug, actor, JSON.stringify(changes), now),
  ]);
  return {
    slug,
    ...next,
    changed: Object.keys(changes),
    actor,
    updatedAt: now,
  };
}

async function sourceBody(request: Request) {
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    throw new AdminError(
      415,
      'JSON_REQUIRED',
      'Content-Type must be application/json',
    );
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new AdminError(
      400,
      'INVALID_JSON',
      'Request body must be valid JSON',
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AdminError(
      400,
      'INVALID_SOURCE',
      'Request body must be an object',
    );
  const body = value as Record<string, unknown>;
  const allowed = ['isActive', 'priority', 'feedUrl', 'adapterType'];
  if (
    !Object.keys(body).length ||
    Object.keys(body).some((key) => !allowed.includes(key))
  )
    throw new AdminError(
      400,
      'INVALID_SOURCE',
      'Source update contains unsupported fields',
    );
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean')
    throw new AdminError(400, 'INVALID_SOURCE', 'isActive must be boolean');
  if (
    body.priority !== undefined &&
    (!Number.isInteger(body.priority) ||
      (body.priority as number) < 0 ||
      (body.priority as number) > 1000)
  )
    throw new AdminError(
      400,
      'INVALID_SOURCE',
      'priority must be an integer between 0 and 1000',
    );
  for (const key of ['feedUrl', 'adapterType'])
    if (body[key] !== undefined && typeof body[key] !== 'string')
      throw new AdminError(400, 'INVALID_SOURCE', `${key} must be a string`);
  return body as {
    isActive?: boolean;
    priority?: number;
    feedUrl?: string;
    adapterType?: string;
  };
}

export class AdminError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface ClusterRow {
  id: string;
  pipeline_state: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  publish_mode: string;
  published_at: string | null;
}

interface AuditRow {
  cluster_id: string;
  actor: string;
  action: EditorialAction;
  from_state: string;
  to_state: string;
  details: string;
  created_at: string;
}

const transitions: Record<EditorialAction, Record<string, string>> = {
  publish: { READY: 'PUBLISHED' },
  unpublish: { PUBLISHED: 'READY' },
  reject: {
    READY_FOR_REVIEW: 'NEEDS_REVIEW',
    NEEDS_REVIEW: 'NEEDS_REVIEW',
    FAILED_VERIFICATION: 'NEEDS_REVIEW',
    FAILED_TTS: 'NEEDS_REVIEW',
    READY: 'NEEDS_REVIEW',
  },
  regenerate_article: {
    READY_FOR_REVIEW: 'EXTRACTING',
    NEEDS_REVIEW: 'EXTRACTING',
    FAILED_VERIFICATION: 'EXTRACTING',
    FAILED_TTS: 'EXTRACTING',
    READY: 'EXTRACTING',
  },
  rehumanize: {
    READY_FOR_REVIEW: 'WRITING',
    NEEDS_REVIEW: 'WRITING',
    FAILED_VERIFICATION: 'WRITING',
    READY: 'WRITING',
  },
  regenerate_audio: { READY: 'TTS_PENDING', FAILED_TTS: 'TTS_PENDING' },
};

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++)
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return mismatch === 0;
}

function authenticate(request: Request, env: AdminEnv): string {
  if (!env.ADMIN_API_TOKEN)
    throw new AdminError(
      503,
      'ADMIN_AUTH_NOT_CONFIGURED',
      'Admin authentication is not configured',
    );
  const authorization = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.ADMIN_API_TOKEN}`;
  if (!constantTimeEqual(authorization, expected))
    throw new AdminError(
      401,
      'UNAUTHORIZED',
      'Valid admin authentication is required',
    );
  const actor = (
    request.headers.get('cf-access-authenticated-user-email') ??
    request.headers.get('x-admin-actor') ??
    ''
  ).trim();
  if (!actor || actor.length > 254)
    throw new AdminError(
      401,
      'ACTOR_REQUIRED',
      'An authenticated actor identity is required',
    );
  return actor;
}

async function requestDetails(
  request: Request,
): Promise<Record<string, unknown>> {
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    throw new AdminError(
      415,
      'JSON_REQUIRED',
      'Content-Type must be application/json',
    );
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new AdminError(
      400,
      'INVALID_JSON',
      'Request body must be valid JSON',
    );
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new AdminError(
      400,
      'INVALID_BODY',
      'Request body must be a JSON object',
    );
  const details = value as Record<string, unknown>;
  if (
    Object.keys(details).some(
      (key) => !['approved', 'reason', 'note'].includes(key),
    )
  )
    throw new AdminError(
      400,
      'INVALID_BODY',
      'Request body contains unsupported fields',
    );
  for (const key of ['reason', 'note']) {
    const item = details[key];
    if (
      item !== undefined &&
      (typeof item !== 'string' ||
        item.trim().length === 0 ||
        item.length > 1000)
    )
      throw new AdminError(
        400,
        'INVALID_BODY',
        `${key} must be a non-empty string of at most 1000 characters`,
      );
  }
  return details;
}

function result(row: AuditRow, replayed: boolean) {
  return {
    articleId: row.cluster_id,
    action: row.action,
    fromState: row.from_state,
    state: row.to_state,
    actor: row.actor,
    details: JSON.parse(row.details) as Record<string, unknown>,
    actedAt: row.created_at,
    replayed,
  };
}

export async function handleAdminAction(
  request: Request,
  env: AdminEnv,
  url: URL,
) {
  const match = url.pathname.match(
    /^\/v1\/admin\/(?:articles|story-clusters)\/([^/]+)\/(publish|unpublish|reject|regenerate-article|rehumanize|regenerate-audio)$/,
  );
  if (!match) return null;
  const actor = authenticate(request, env);
  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    throw new AdminError(400, 'INVALID_ARTICLE_ID', 'Invalid article id');
  }
  if (!ID.test(id))
    throw new AdminError(400, 'INVALID_ARTICLE_ID', 'Invalid article id');
  const action = match[2].replaceAll('-', '_') as EditorialAction;
  const key = request.headers.get('idempotency-key')?.trim() ?? '';
  if (!IDEMPOTENCY_KEY.test(key))
    throw new AdminError(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Idempotency-Key must contain 8 to 128 visible ASCII characters',
    );

  const existing = await env.DB.prepare(
    `SELECT cluster_id, actor, action, from_state, to_state, details, created_at
       FROM editorial_audit_records WHERE idempotency_key = ?1`,
  )
    .bind(key)
    .first<AuditRow>();
  if (existing) {
    if (
      existing.cluster_id !== id ||
      existing.action !== action ||
      existing.actor !== actor
    )
      throw new AdminError(
        409,
        'IDEMPOTENCY_KEY_CONFLICT',
        'Idempotency-Key was already used for another request',
      );
    return result(existing, true);
  }

  const details = await requestDetails(request);
  if (action === 'publish' && details.approved !== true)
    throw new AdminError(
      400,
      'EXPLICIT_APPROVAL_REQUIRED',
      'Publishing requires approved: true',
    );
  if (action === 'reject' && typeof details.reason !== 'string')
    throw new AdminError(
      400,
      'REJECTION_REASON_REQUIRED',
      'Rejecting requires a reason',
    );

  const cluster = await env.DB.prepare(
    `SELECT id, pipeline_state, reviewed_at, reviewed_by, publish_mode, published_at
       FROM story_clusters WHERE id = ?1`,
  )
    .bind(id)
    .first<ClusterRow>();
  if (!cluster)
    throw new AdminError(404, 'ARTICLE_NOT_FOUND', 'Article not found');
  const nextState = transitions[action][cluster.pipeline_state];
  if (!nextState)
    throw new AdminError(
      409,
      'INVALID_STATE_TRANSITION',
      `Cannot ${match[2]} from ${cluster.pipeline_state}`,
    );

  const now = new Date().toISOString();
  const jobId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `UPDATE story_clusters SET pipeline_state = ?2,
         reviewed_at = CASE WHEN ?3 IN ('publish','reject') THEN ?4 ELSE reviewed_at END,
         reviewed_by = CASE WHEN ?3 IN ('publish','reject') THEN ?5 ELSE reviewed_by END,
         publish_mode = CASE WHEN ?3 = 'publish' THEN 'manual' ELSE publish_mode END,
         published_at = CASE WHEN ?3 = 'publish' THEN ?4 WHEN ?3 = 'unpublish' THEN NULL ELSE published_at END,
         updated_at = ?4
       WHERE id = ?1 AND pipeline_state = ?6`,
    ).bind(id, nextState, action, now, actor, cluster.pipeline_state),
  ];
  if (action === 'regenerate_article' || action === 'rehumanize') {
    statements.push(
      env.DB.prepare(
        `INSERT INTO processing_jobs (id, cluster_id, job_type, status, payload, deduplication_key)
       VALUES (?1, ?2, ?3, 'pending', ?4, ?5)`,
      ).bind(
        jobId,
        id,
        action === 'rehumanize' ? 'write' : 'extract',
        JSON.stringify({
          requestedBy: actor,
          idempotencyKey: key,
          mode: action,
        }),
        `editorial:${key}`,
      ),
    );
  } else if (action === 'regenerate_audio') {
    const script = await env.DB.prepare(
      `SELECT audio.id FROM story_audio_scripts audio
       JOIN story_audio_script_verifications verification ON verification.audio_script_id = audio.id
       WHERE audio.cluster_id = ?1 AND verification.passed = 1 ORDER BY audio.created_at DESC LIMIT 1`,
    )
      .bind(id)
      .first<{ id: string }>();
    if (!script)
      throw new AdminError(
        409,
        'VERIFIED_AUDIO_SCRIPT_REQUIRED',
        'No verified audio script is available',
      );
    statements.push(
      env.DB.prepare(
        `INSERT INTO processing_jobs (id, cluster_id, job_type, status, payload, deduplication_key)
       VALUES (?1, ?2, 'audio', 'pending', ?3, ?4)`,
      ).bind(
        jobId,
        id,
        JSON.stringify({ audioScriptId: script.id, requestedBy: actor }),
        `editorial:${key}`,
      ),
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO editorial_audit_records
       (cluster_id, actor, action, from_state, to_state, details, idempotency_key, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    ).bind(
      id,
      actor,
      action,
      cluster.pipeline_state,
      nextState,
      JSON.stringify(details),
      key,
      now,
    ),
  );
  await env.DB.batch(statements);
  return result(
    {
      cluster_id: id,
      actor,
      action,
      from_state: cluster.pipeline_state,
      to_state: nextState,
      details: JSON.stringify(details),
      created_at: now,
    },
    false,
  );
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Authenticated review detail, including immutable source and audit context. */
export async function handleAdminReview(
  request: Request,
  env: AdminEnv,
  url: URL,
) {
  const match = url.pathname.match(
    /^\/v1\/admin\/story-clusters\/([^/]+)(?:\/draft)?$/,
  );
  if (!match) return null;
  const actor = authenticate(request, env);
  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    throw new AdminError(400, 'INVALID_ARTICLE_ID', 'Invalid article id');
  }
  if (!ID.test(id))
    throw new AdminError(400, 'INVALID_ARTICLE_ID', 'Invalid article id');

  if (request.method === 'PATCH' && url.pathname.endsWith('/draft')) {
    const key = request.headers.get('idempotency-key')?.trim() ?? '';
    if (!IDEMPOTENCY_KEY.test(key))
      throw new AdminError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key must contain 8 to 128 visible ASCII characters',
      );
    const body = await requestDetailsForDraft(request);
    const current = await currentDraft(env, id);
    if (!current)
      throw new AdminError(404, 'ARTICLE_NOT_FOUND', 'Article not found');
    const changedFields = (Object.keys(body) as (keyof typeof body)[]).filter(
      (field) => body[field] !== current[field],
    );
    if (changedFields.length === 0)
      throw new AdminError(409, 'NO_CHANGES', 'No draft fields changed');
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO editorial_draft_revisions (cluster_id,title_mm,summary_mm,content_mm,audio_script_mm,actor,changed_fields,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`,
      ).bind(
        id,
        body.titleMm,
        body.summaryMm,
        body.contentMm,
        body.audioScriptMm,
        actor,
        JSON.stringify(changedFields),
        now,
      ),
      env.DB.prepare(
        `INSERT INTO editorial_audit_records (cluster_id,actor,action,from_state,to_state,details,idempotency_key,created_at) SELECT id,?2,'save_draft',pipeline_state,pipeline_state,?3,?4,?5 FROM story_clusters WHERE id=?1`,
      ).bind(id, actor, JSON.stringify({ changedFields }), key, now),
      env.DB.prepare(
        'UPDATE story_clusters SET updated_at=?2 WHERE id=?1',
      ).bind(id, now),
    ]);
    return { articleId: id, changedFields, actor, savedAt: now };
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const cluster = await env.DB.prepare(
    'SELECT id,title,pipeline_state AS state,updated_at AS updatedAt FROM story_clusters WHERE id=?1',
  )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!cluster)
    throw new AdminError(404, 'ARTICLE_NOT_FOUND', 'Article not found');
  const [draft, sources, extraction, verification, audio, audit] =
    await Promise.all([
      currentDraft(env, id),
      env.DB.prepare(
        `SELECT COALESCE(s.name,'Unknown source') name,
        COALESCE(ars.original_title,a.title) title,
        COALESCE(ars.source_url,a.canonical_url) url,
        COALESCE(ars.original_published_at,a.published_at) publishedAt
        FROM story_cluster_articles sca JOIN articles a ON a.id=sca.article_id
        LEFT JOIN article_sources ars ON ars.article_id=a.id
        LEFT JOIN sources s ON s.id=ars.source_id WHERE sca.cluster_id=?1
        ORDER BY sca.is_primary DESC,sca.added_at`,
      )
        .bind(id)
        .all<Record<string, unknown>>(),
      env.DB.prepare(
        'SELECT output FROM story_extractions WHERE cluster_id=?1 ORDER BY created_at DESC LIMIT 1',
      )
        .bind(id)
        .first<{ output: string }>(),
      env.DB.prepare(
        'SELECT passed,attempt,errors,created_at checkedAt FROM story_verifications WHERE cluster_id=?1 ORDER BY created_at DESC LIMIT 1',
      )
        .bind(id)
        .first<{
          passed: number | null;
          attempt: number;
          errors: string | null;
          checkedAt: string;
        }>(),
      env.DB.prepare(
        `SELECT '/v1/admin/audio/' || id url,duration_seconds durationSeconds,narrator FROM story_audio_assets WHERE cluster_id=?1 AND ready=1 ORDER BY generated_at DESC LIMIT 1`,
      )
        .bind(id)
        .first<Record<string, unknown>>(),
      env.DB.prepare(
        'SELECT action,actor,created_at createdAt,details FROM editorial_audit_records WHERE cluster_id=?1 ORDER BY created_at DESC LIMIT 50',
      )
        .bind(id)
        .all<{
          action: string;
          actor: string;
          createdAt: string;
          details: string;
        }>(),
    ]);
  const output = parseJson<Record<string, unknown>>(
    extraction?.output ?? null,
    {},
  );
  const factsValue = output.facts ?? output.keyFacts ?? [];
  const facts = Array.isArray(factsValue)
    ? factsValue.map((fact) =>
        typeof fact === 'string' ? fact : JSON.stringify(fact),
      )
    : [];
  return {
    ...cluster,
    draft,
    sources: sources.results,
    facts,
    verification: verification
      ? {
          ...verification,
          passed:
            verification.passed === null ? null : verification.passed === 1,
          errors: parseJson<string[]>(verification.errors, []),
        }
      : null,
    audio,
    audit: audit.results.map((item) => ({
      action: item.action,
      actor: item.actor,
      createdAt: item.createdAt,
      changedFields:
        parseJson<{ changedFields?: string[] }>(item.details, {})
          .changedFields ?? [],
    })),
  };
}

async function currentDraft(env: AdminEnv, id: string) {
  const revision = await env.DB.prepare(
    'SELECT title_mm titleMm,summary_mm summaryMm,content_mm contentMm,audio_script_mm audioScriptMm FROM editorial_draft_revisions WHERE cluster_id=?1 ORDER BY created_at DESC LIMIT 1',
  )
    .bind(id)
    .first<{
      titleMm: string;
      summaryMm: string;
      contentMm: string;
      audioScriptMm: string;
    }>();
  if (revision) return revision;
  return env.DB.prepare(
    `SELECT d.title_mm titleMm,d.summary_mm summaryMm,d.content_mm contentMm,COALESCE(a.audio_script_mm,'') audioScriptMm FROM story_drafts d LEFT JOIN story_audio_scripts a ON a.cluster_id=d.cluster_id WHERE d.cluster_id=?1 ORDER BY d.generated_at DESC,a.created_at DESC LIMIT 1`,
  )
    .bind(id)
    .first<{
      titleMm: string;
      summaryMm: string;
      contentMm: string;
      audioScriptMm: string;
    }>();
}

async function requestDetailsForDraft(request: Request) {
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    throw new AdminError(
      415,
      'JSON_REQUIRED',
      'Content-Type must be application/json',
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AdminError(
      400,
      'INVALID_JSON',
      'Request body must be valid JSON',
    );
  }
  const limits = {
    titleMm: 180,
    summaryMm: 600,
    contentMm: 20000,
    audioScriptMm: 12000,
  } as const;
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !(key in limits))
  )
    throw new AdminError(
      400,
      'INVALID_DRAFT',
      'Draft contains unsupported fields',
    );
  for (const [field, limit] of Object.entries(limits)) {
    const value = (body as Record<string, unknown>)[field];
    if (typeof value !== 'string' || !value.trim() || value.length > limit)
      throw new AdminError(
        400,
        'INVALID_DRAFT',
        `${field} is required and must not exceed ${limit} characters`,
      );
  }
  return body as {
    titleMm: string;
    summaryMm: string;
    contentMm: string;
    audioScriptMm: string;
  };
}

export function transitionFor(
  action: EditorialAction,
  state: string,
): string | undefined {
  return transitions[action][state];
}
