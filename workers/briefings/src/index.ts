import {
  parseConfig,
  selectStories,
  type BriefingConfig,
  type Candidate,
} from './selection.ts';

interface Env {
  DB: D1Database;
  BRIEFING_CONFIG?: string;
}

export type BriefingPeriod = 'morning' | 'evening';

interface PlaylistRow {
  id: string;
  editor_locked_at: string | null;
  manual_override: number;
}

function eventLog(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields }));
}

function boundedError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    1000,
  );
}

async function candidates(
  env: Env,
  config: BriefingConfig,
  now: Date,
): Promise<Candidate[]> {
  const cutoff = new Date(
    now.getTime() - config.lookbackHours * 3_600_000,
  ).toISOString();
  const result = await env.DB.prepare(
    `SELECT a.id articleId, sca.cluster_id clusterId, a.category_id categoryId,
            COALESCE(a.published_at, a.created_at) publishedAt,
            MIN(1.0, (COUNT(DISTINCT src.id) * 0.15) +
              (MAX(COALESCE(src.priority, 0)) * 0.05) + 0.25) importance
       FROM articles a
       JOIN story_cluster_articles sca ON sca.article_id = a.id
       JOIN story_clusters sc ON sc.id = sca.cluster_id
       JOIN story_audio_assets audio ON audio.cluster_id = sc.id AND audio.ready = 1
       LEFT JOIN article_sources ars ON ars.article_id = a.id
       LEFT JOIN sources src ON src.id = ars.source_id
      WHERE a.status = 'published' AND sc.status = 'active'
        AND COALESCE(a.published_at, a.created_at) >= ?1
      GROUP BY a.id, sca.cluster_id
      ORDER BY publishedAt DESC`,
  )
    .bind(cutoff)
    .all<Candidate>();
  return result.results;
}

export async function generateBriefing(
  env: Env,
  period: BriefingPeriod,
  now = new Date(),
): Promise<{ status: string; playlistId?: string; selectedCount?: number }> {
  const config = parseConfig(env.BRIEFING_CONFIG);
  const date = now.toISOString().slice(0, 10);
  const generationKey = `${date}:${period}`;
  const startedAt = now.toISOString();
  const eventId = crypto.randomUUID();
  const claim = await env.DB.prepare(
    `INSERT OR IGNORE INTO briefing_generation_events
      (id,generation_key,period,scheduled_for,status,config,started_at)
     VALUES (?1,?2,?3,?4,'running',?5,?6)`,
  )
    .bind(
      eventId,
      generationKey,
      period,
      startedAt,
      JSON.stringify(config),
      startedAt,
    )
    .run();
  if (!claim.meta.changes) {
    eventLog('briefing.generation.duplicate', { generationKey });
    return { status: 'duplicate' };
  }

  try {
    const slug = `${period}-briefing-${date}`;
    const existing = await env.DB.prepare(
      'SELECT id,editor_locked_at,manual_override FROM playlists WHERE slug=?1',
    )
      .bind(slug)
      .first<PlaylistRow>();
    if (existing?.editor_locked_at || existing?.manual_override) {
      await env.DB.prepare(
        "UPDATE briefing_generation_events SET status='skipped_locked',playlist_id=?2,completed_at=?3 WHERE id=?1",
      )
        .bind(eventId, existing.id, new Date().toISOString())
        .run();
      eventLog('briefing.generation.skipped_locked', {
        generationKey,
        playlistId: existing.id,
      });
      return { status: 'skipped_locked', playlistId: existing.id };
    }

    const available = await candidates(env, config, now);
    const selected = selectStories(available, config, now);
    if (selected.length < config.minStories)
      throw new Error(
        `Only ${selected.length} audio-ready unique story clusters available; ${config.minStories} required`,
      );

    const playlistId = existing?.id ?? crypto.randomUUID();
    const title =
      period === 'morning' ? 'Morning Briefing' : 'Evening Briefing';
    const statements = [
      env.DB.prepare(
        `INSERT INTO playlists
          (id,slug,title,status,is_active,schedule_type,briefing_period,generation_key,generated_at)
         VALUES (?1,?2,?3,'draft',1,'daily',?4,?5,?6)
         ON CONFLICT(slug) DO UPDATE SET title=excluded.title,
           briefing_period=excluded.briefing_period,generation_key=excluded.generation_key,
           generated_at=excluded.generated_at,updated_at=excluded.generated_at
         WHERE playlists.editor_locked_at IS NULL AND playlists.manual_override=0`,
      ).bind(playlistId, slug, title, period, generationKey, startedAt),
      env.DB.prepare('DELETE FROM playlist_articles WHERE playlist_id=?1').bind(
        playlistId,
      ),
      ...selected.map((story, position) =>
        env.DB.prepare(
          'INSERT INTO playlist_articles (playlist_id,article_id,position,selection_reason) VALUES (?1,?2,?3,?4)',
        ).bind(
          playlistId,
          story.articleId,
          position,
          JSON.stringify(story.reason),
        ),
      ),
      env.DB.prepare(
        `UPDATE briefing_generation_events SET status='completed',playlist_id=?2,
          candidate_count=?3,selected_count=?4,completed_at=?5 WHERE id=?1`,
      ).bind(
        eventId,
        playlistId,
        available.length,
        selected.length,
        new Date().toISOString(),
      ),
    ];
    await env.DB.batch(statements);
    eventLog('briefing.generation.completed', {
      generationKey,
      playlistId,
      candidateCount: available.length,
      selectedCount: selected.length,
    });
    return { status: 'completed', playlistId, selectedCount: selected.length };
  } catch (error) {
    const message = boundedError(error);
    await env.DB.prepare(
      "UPDATE briefing_generation_events SET status='failed',error_message=?2,completed_at=?3 WHERE id=?1",
    )
      .bind(eventId, message, new Date().toISOString())
      .run();
    console.error(
      JSON.stringify({
        event: 'briefing.generation.failed',
        generationKey,
        error: message,
      }),
    );
    throw error;
  }
}

export default {
  async fetch(): Promise<Response> {
    return Response.json({ status: 'ok', service: 'briefings' });
  },
  async scheduled(controller, env, context): Promise<void> {
    const period: BriefingPeriod =
      controller.cron === '0 0 * * *' ? 'morning' : 'evening';
    context.waitUntil(generateBriefing(env, period));
  },
} satisfies ExportedHandler<Env>;
