export type ArticleEntryPoint =
  'feed' | 'search' | 'saved' | 'notification' | 'related' | 'unknown';

export interface AnalyticsEventMap {
  article_open: { article_id: string; entry_point: ArticleEntryPoint };
  audio_started: { article_id: string; duration_seconds?: number };
  audio_paused: { article_id: string; position_seconds: number };
  audio_progress: {
    article_id: string;
    milestone_percent: 25 | 50 | 75;
  };
  audio_completed: { article_id: string; duration_seconds: number };
  save_changed: { article_id: string; action: 'saved' | 'removed' };
  download_changed: {
    article_id: string;
    action: 'downloaded' | 'removed';
    automatic: boolean;
  };
  playlist_started: { item_count: number; start_index: number };
  search_completed: { query_length: number; result_count: number };
  notification_open: {
    notification_type: 'breaking_news' | 'briefing' | 'category' | 'unknown';
    article_id?: string;
  };
}

export type AnalyticsEventName = keyof AnalyticsEventMap;
