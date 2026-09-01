import type { MobileAnalytics } from './client.ts';

const MILESTONES = [25, 50, 75] as const;

/** Emits each progress milestone at most once for the currently loaded item. */
export class AudioMilestoneTracker {
  private articleId: string | null = null;
  private emitted = new Set<number>();
  private readonly client: MobileAnalytics;

  constructor(client: MobileAnalytics) {
    this.client = client;
  }

  reset(articleId: string) {
    if (articleId === this.articleId) return;
    this.articleId = articleId;
    this.emitted.clear();
  }

  update(articleId: string, position: number, duration: number) {
    this.reset(articleId);
    if (
      !Number.isFinite(position) ||
      !Number.isFinite(duration) ||
      duration <= 0
    )
      return;
    const percent = (Math.max(0, position) / duration) * 100;
    for (const milestone of MILESTONES) {
      if (percent < milestone || this.emitted.has(milestone)) continue;
      this.emitted.add(milestone);
      this.client.track('audio_progress', {
        article_id: articleId,
        milestone_percent: milestone,
      });
    }
  }
}
