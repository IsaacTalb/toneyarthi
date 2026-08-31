const ID = /^[a-zA-Z0-9_-]{1,64}$/;
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{8,128}$/;

export type EditorialAction =
  | 'publish'
  | 'unpublish'
  | 'reject'
  | 'regenerate_article'
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
    /^\/v1\/admin\/(?:articles|story-clusters)\/([^/]+)\/(publish|unpublish|reject|regenerate-article|regenerate-audio)$/,
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
  if (action === 'regenerate_article') {
    statements.push(
      env.DB.prepare(
        `INSERT INTO processing_jobs (id, cluster_id, job_type, status, payload, deduplication_key)
       VALUES (?1, ?2, 'extract', 'pending', ?3, ?4)`,
      ).bind(
        jobId,
        id,
        JSON.stringify({ requestedBy: actor, idempotencyKey: key }),
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

export function transitionFor(
  action: EditorialAction,
  state: string,
): string | undefined {
  return transitions[action][state];
}
