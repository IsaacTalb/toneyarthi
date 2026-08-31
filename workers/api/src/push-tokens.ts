export class PushTokenError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface PushTokenEnv {
  DB: D1Database;
}

const INSTALLATION_ID = /^[A-Za-z0-9_-]{16,128}$/;
const EXPO_TOKEN =
  /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,220}\]$/;
const PLATFORMS = new Set(['ios', 'android']);
const ENVIRONMENTS = new Set(['development', 'preview', 'production']);
const CATEGORY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function body(request: Request): Promise<Record<string, unknown>> {
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .includes('application/json')
  )
    throw new PushTokenError(
      415,
      'JSON_REQUIRED',
      'Content-Type must be application/json',
    );
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new PushTokenError(
      400,
      'INVALID_BODY',
      'A valid JSON object is required',
    );
  }
}

function requiredString(data: Record<string, unknown>, key: string): string {
  if (typeof data[key] !== 'string')
    throw new PushTokenError(400, 'INVALID_REGISTRATION', `${key} is invalid`);
  return data[key];
}

export async function handlePushTokenRequest(
  request: Request,
  env: PushTokenEnv,
  url: URL,
): Promise<Record<string, unknown> | null> {
  if (url.pathname !== '/v1/push-tokens') return null;
  const data = await body(request);
  const installationId = requiredString(data, 'installationId');
  if (!INSTALLATION_ID.test(installationId))
    throw new PushTokenError(
      400,
      'INVALID_INSTALLATION_ID',
      'installationId is invalid',
    );

  if (request.method === 'DELETE') {
    const token = requiredString(data, 'token');
    if (!EXPO_TOKEN.test(token))
      throw new PushTokenError(400, 'INVALID_TOKEN', 'token is invalid');
    // Both values must match: stale clients cannot revoke a newer rotated token.
    await env.DB.prepare(
      "UPDATE push_tokens SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE installation_id = ? AND token = ? AND revoked_at IS NULL",
    )
      .bind(installationId, token)
      .run();
    return { revoked: true };
  }
  if (request.method !== 'POST') return null;

  const token = requiredString(data, 'token');
  const platform = requiredString(data, 'platform');
  const appEnvironment = requiredString(data, 'appEnvironment');
  if (!EXPO_TOKEN.test(token))
    throw new PushTokenError(400, 'INVALID_TOKEN', 'token is invalid');
  if (!PLATFORMS.has(platform))
    throw new PushTokenError(
      400,
      'INVALID_PLATFORM',
      'platform must be ios or android',
    );
  if (!ENVIRONMENTS.has(appEnvironment))
    throw new PushTokenError(
      400,
      'INVALID_APP_ENVIRONMENT',
      'appEnvironment is invalid',
    );

  const preferences = data.preferences;
  if (
    !preferences ||
    typeof preferences !== 'object' ||
    Array.isArray(preferences)
  )
    throw new PushTokenError(
      400,
      'INVALID_PREFERENCES',
      'preferences is invalid',
    );
  const value = preferences as Record<string, unknown>;
  if (
    typeof value.breakingNews !== 'boolean' ||
    typeof value.briefings !== 'boolean' ||
    !Array.isArray(value.categories)
  )
    throw new PushTokenError(
      400,
      'INVALID_PREFERENCES',
      'preferences is invalid',
    );
  const categories = [...new Set(value.categories)];
  if (
    categories.length > 25 ||
    categories.some((item) => typeof item !== 'string' || !CATEGORY.test(item))
  )
    throw new PushTokenError(
      400,
      'INVALID_CATEGORIES',
      'categories are invalid',
    );
  if (categories.length) {
    const placeholders = categories.map(() => '?').join(',');
    const active = await env.DB.prepare(
      `SELECT slug FROM categories WHERE is_active = 1 AND slug IN (${placeholders})`,
    )
      .bind(...categories)
      .all<{ slug: string }>();
    if (active.results.length !== categories.length)
      throw new PushTokenError(
        400,
        'INVALID_CATEGORIES',
        'One or more categories are unavailable',
      );
  }

  // Upsert by installation rotates its token; token uniqueness prevents duplicate delivery.
  await env.DB.prepare(
    `INSERT INTO push_tokens (installation_id, token, platform, app_environment, breaking_news, briefings, category_slugs)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(installation_id) DO UPDATE SET token = excluded.token, platform = excluded.platform,
       app_environment = excluded.app_environment, breaking_news = excluded.breaking_news,
       briefings = excluded.briefings, category_slugs = excluded.category_slugs, revoked_at = NULL,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  )
    .bind(
      installationId,
      token,
      platform,
      appEnvironment,
      value.breakingNews ? 1 : 0,
      value.briefings ? 1 : 0,
      JSON.stringify(categories),
    )
    .run();
  return { registered: true };
}
