const ID = /^[a-zA-Z0-9_-]{1,64}$/;
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{8,128}$/;

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
        `SELECT COALESCE(s.name,'Unknown source') name,a.title,COALESCE(ars.source_url,a.canonical_url) url,a.published_at publishedAt FROM story_cluster_articles sca JOIN articles a ON a.id=sca.article_id LEFT JOIN article_sources ars ON ars.article_id=a.id LEFT JOIN sources s ON s.id=ars.source_id WHERE sca.cluster_id=?1 ORDER BY sca.is_primary DESC,sca.added_at`,
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
