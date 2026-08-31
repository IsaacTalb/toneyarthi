import { createGeminiClient } from '@toneyarthi/ai';
import { audioKey, normalizeMediaKey, type MediaKey } from '@toneyarthi/media';

const service = 'audio-processor';
const WAV_HEADER_BYTES = 44;

interface Env {
  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
  GEMINI_API_KEY: string;
  GEMINI_TTS_MODEL: string;
  TTS_NARRATOR?: string;
  TTS_STYLE?: string;
  TTS_TIMEOUT_MS?: string;
  TTS_FORCE_REGENERATION_TOKEN?: string;
}

interface AudioJobPayload {
  version: 1;
  jobId: string;
  clusterId: string;
  type: 'audio';
  forceRegeneration?: boolean;
  forceRegenerationToken?: string;
}

interface ClaimedJob {
  attempts: number;
  max_attempts: number;
  audio_script_id: string;
  audio_script_mm: string;
}

function isAudioJobPayload(value: unknown): value is AudioJobPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const item = value as Record<string, unknown>;
  const allowed = new Set([
    'version',
    'jobId',
    'clusterId',
    'type',
    'forceRegeneration',
    'forceRegenerationToken',
  ]);
  return (
    Object.keys(item).every((key) => allowed.has(key)) &&
    item.version === 1 &&
    item.type === 'audio' &&
    typeof item.jobId === 'string' &&
    item.jobId.length > 0 &&
    typeof item.clusterId === 'string' &&
    item.clusterId.length > 0 &&
    (item.forceRegeneration === undefined ||
      typeof item.forceRegeneration === 'boolean') &&
    (item.forceRegenerationToken === undefined ||
      typeof item.forceRegenerationToken === 'string')
  );
}

function forceRegeneration(payload: AudioJobPayload, env: Env): boolean {
  if (!payload.forceRegeneration) return false;
  if (!env.TTS_FORCE_REGENERATION_TOKEN)
    throw new Error('Force regeneration is not configured');
  if (payload.forceRegenerationToken !== env.TTS_FORCE_REGENERATION_TOKEN)
    throw new Error('Invalid force regeneration authorization');
  return true;
}

async function claimJob(
  env: Env,
  payload: AudioJobPayload,
): Promise<'claimed' | 'completed' | 'unavailable'> {
  const result = await env.DB.prepare(
    `UPDATE processing_jobs SET status = 'processing', attempts = attempts + 1,
       started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?1 AND cluster_id = ?2 AND job_type = 'audio'
       AND status = 'pending' AND attempts < max_attempts
       AND available_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       AND EXISTS (SELECT 1 FROM story_clusters c WHERE c.id = ?2 AND c.pipeline_state = 'TTS_PENDING')`,
  )
    .bind(payload.jobId, payload.clusterId)
    .run();
  if (result.meta.changes === 1) return 'claimed';
  const row = await env.DB.prepare(
    `SELECT status FROM processing_jobs
     WHERE id = ?1 AND cluster_id = ?2 AND job_type = 'audio'`,
  )
    .bind(payload.jobId, payload.clusterId)
    .first<{ status: string }>();
  return row?.status === 'completed' ? 'completed' : 'unavailable';
}

async function loadClaimedJob(env: Env, payload: AudioJobPayload) {
  return env.DB.prepare(
    `SELECT job.attempts, job.max_attempts,
            script.id AS audio_script_id, script.audio_script_mm
       FROM processing_jobs job
       JOIN story_audio_scripts script
         ON script.id = json_extract(job.payload, '$.audioScriptId')
       JOIN story_audio_script_verifications verification
         ON verification.audio_script_id = script.id AND verification.passed = 1
      WHERE job.id = ?1 AND job.cluster_id = ?2 AND script.cluster_id = ?2
        AND job.job_type = 'audio' AND job.status = 'processing'`,
  )
    .bind(payload.jobId, payload.clusterId)
    .first<ClaimedJob>();
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error('TTS_TIMEOUT_MS must be a positive integer');
  return parsed;
}

function wavFromPcm(data: Uint8Array, mimeType: string) {
  const rateMatch = /rate=(\d+)/i.exec(mimeType);
  const sampleRate = Number(rateMatch?.[1] ?? 24_000);
  if (!/^audio\/(?:l16|pcm)(?:;|$)/i.test(mimeType) || data.byteLength % 2)
    throw new Error(`Unsupported or malformed TTS audio format: ${mimeType}`);
  const output = new Uint8Array(WAV_HEADER_BYTES + data.byteLength);
  const view = new DataView(output.buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((character, index) =>
      view.setUint8(offset + index, character.charCodeAt(0)),
    );
  text(0, 'RIFF');
  view.setUint32(4, output.byteLength - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, data.byteLength, true);
  output.set(data, WAV_HEADER_BYTES);
  return {
    data: output,
    sampleRate,
    durationSeconds: data.byteLength / 2 / sampleRate,
  };
}

function isValidAudioObject(object: R2Object | null): object is R2Object {
  return (
    object !== null &&
    object.size > WAV_HEADER_BYTES &&
    object.httpMetadata?.contentType === 'audio/wav' &&
    object.customMetadata?.ready === 'true' &&
    Number(object.customMetadata?.durationSeconds) > 0
  );
}

async function finish(
  env: Env,
  payload: AudioJobPayload,
  job: ClaimedJob,
  key: MediaKey,
  object: R2Object,
) {
  const durationSeconds = Number(object.customMetadata?.durationSeconds);
  const sampleRate = Number(object.customMetadata?.sampleRate);
  const result = {
    audioKey: key,
    durationSeconds,
    sizeBytes: object.size,
    ready: true,
    mimeType: 'audio/wav',
    encoding: 'pcm_s16le',
    sampleRate,
    channels: 1,
    model: env.GEMINI_TTS_MODEL,
    narrator: env.TTS_NARRATOR ?? null,
  };
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO story_audio_assets
         (cluster_id, audio_script_id, job_id, audio_key, duration_seconds,
          byte_size, ready, mime_type, encoding, sample_rate, channels, model, narrator)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 'audio/wav', 'pcm_s16le', ?7, 1, ?8, ?9)
       ON CONFLICT(audio_script_id) DO UPDATE SET
         job_id=excluded.job_id, audio_key=excluded.audio_key,
         duration_seconds=excluded.duration_seconds, byte_size=excluded.byte_size,
         ready=1, mime_type=excluded.mime_type, encoding=excluded.encoding,
         sample_rate=excluded.sample_rate, channels=excluded.channels,
         model=excluded.model, narrator=excluded.narrator,
         generated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    ).bind(
      payload.clusterId,
      job.audio_script_id,
      payload.jobId,
      key,
      durationSeconds,
      object.size,
      sampleRate,
      env.GEMINI_TTS_MODEL,
      env.TTS_NARRATOR?.trim() || null,
    ),
    env.DB.prepare(
      `UPDATE processing_jobs SET status='completed', result=?2, error_message=NULL,
         completed_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id=?1 AND status='processing'`,
    ).bind(payload.jobId, JSON.stringify(result)),
    env.DB.prepare(
      `UPDATE story_clusters SET pipeline_state='READY',
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id=?1 AND pipeline_state='TTS_PENDING'`,
    ).bind(payload.clusterId),
  ]);
}

async function fail(env: Env, payload: AudioJobPayload, error: unknown) {
  const detail = (error instanceof Error ? error.message : String(error)).slice(
    0,
    4000,
  );
  const row = await env.DB.prepare(
    'SELECT attempts, max_attempts FROM processing_jobs WHERE id=?1',
  )
    .bind(payload.jobId)
    .first<{ attempts: number; max_attempts: number }>();
  const terminal = !!row && row.attempts >= row.max_attempts;
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE processing_jobs SET status=?2, error_message=?3,
         available_at=CASE WHEN ?2='pending' THEN datetime('now', '+10 seconds') ELSE available_at END,
         completed_at=CASE WHEN ?2='FAILED_TTS' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NULL END,
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id=?1 AND status='processing'`,
    ).bind(payload.jobId, terminal ? 'FAILED_TTS' : 'pending', detail),
    env.DB.prepare(
      `UPDATE story_clusters SET pipeline_state='FAILED_TTS',
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id=?1 AND pipeline_state='TTS_PENDING' AND ?2=1`,
    ).bind(payload.clusterId, terminal ? 1 : 0),
  ]);
  return terminal;
}

async function processMessage(message: Message<unknown>, env: Env) {
  if (!isAudioJobPayload(message.body)) {
    console.error(JSON.stringify({ event: 'queue.message.invalid', service }));
    message.ack();
    return;
  }
  const payload = message.body;
  const claim = await claimJob(env, payload);
  if (claim === 'completed') return message.ack();
  if (claim !== 'claimed') return message.retry({ delaySeconds: 5 });
  try {
    const job = await loadClaimedJob(env, payload);
    if (!job) throw new Error('Job does not reference a verified audio script');
    const key = audioKey(`${payload.clusterId}-${job.audio_script_id}.wav`);
    const existing = await env.MEDIA_BUCKET.head(key);
    if (isValidAudioObject(existing) && !forceRegeneration(payload, env)) {
      await finish(env, payload, job, key, existing);
      message.ack();
      return;
    }
    // Validate force authorization before making the external request.
    if (payload.forceRegeneration) forceRegeneration(payload, env);
    const style = env.TTS_STYLE?.trim();
    const text = style
      ? `Narration style: ${style}\n\n${job.audio_script_mm}`
      : job.audio_script_mm;
    const client = createGeminiClient(
      {
        GEMINI_API_KEY: env.GEMINI_API_KEY,
        GEMINI_TEXT_MODEL: env.GEMINI_TTS_MODEL,
        GEMINI_TTS_MODEL: env.GEMINI_TTS_MODEL,
      },
      { timeoutMs: positiveInteger(env.TTS_TIMEOUT_MS, 60_000) },
    );
    const speech = await client.generateSpeech({
      text,
      voice: env.TTS_NARRATOR?.trim() || undefined,
      model: env.GEMINI_TTS_MODEL,
    });
    const wav = wavFromPcm(speech.data, speech.mimeType);
    if (!(wav.durationSeconds > 0)) throw new Error('Generated audio is empty');
    const metadata = {
      ready: 'true',
      durationSeconds: String(wav.durationSeconds),
      sampleRate: String(wav.sampleRate),
      encoding: 'pcm_s16le',
      channels: '1',
      sourceMimeType: speech.mimeType,
    };
    const temporaryKey = normalizeMediaKey(
      `audio/tmp-${payload.jobId}-${crypto.randomUUID()}.wav`,
    );
    try {
      await env.MEDIA_BUCKET.put(temporaryKey, wav.data, {
        httpMetadata: { contentType: 'audio/wav' },
        customMetadata: metadata,
      });
      if (!isValidAudioObject(await env.MEDIA_BUCKET.head(temporaryKey)))
        throw new Error('Temporary audio object failed validation');
      // R2 PUTs are atomic; publishing the already complete buffer prevents a partial final object.
      await env.MEDIA_BUCKET.put(key, wav.data, {
        httpMetadata: { contentType: 'audio/wav' },
        customMetadata: metadata,
      });
      const finalObject = await env.MEDIA_BUCKET.head(key);
      if (!isValidAudioObject(finalObject))
        throw new Error('Final audio object failed validation');
      await finish(env, payload, job, key, finalObject);
    } finally {
      await env.MEDIA_BUCKET.delete(temporaryKey);
    }
    message.ack();
  } catch (error) {
    const terminal = await fail(env, payload, error);
    if (terminal) message.ack();
    else message.retry({ delaySeconds: 10 });
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
