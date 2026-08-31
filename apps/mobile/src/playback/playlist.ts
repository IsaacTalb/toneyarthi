import type { ArticleSummary, ApiClient } from '../api/client';
import type { PlaybackItem } from './types';

export const articleToPlaybackItem = (
  article: ArticleSummary,
): PlaybackItem | null => {
  if (!article.audioUrl?.trim()) return null;
  return {
    id: article.id,
    uri: article.audioUrl,
    title: article.titleMy?.trim() || article.title,
    artist: article.author,
    artworkUri: article.imageUrl,
    category:
      article.categoryNameMy?.trim() ||
      article.categoryName?.trim() ||
      article.categorySlug,
    source: article.sources[0]?.name,
  };
};

/** Resolve an ID-based feed while preserving order and ignoring unavailable audio. */
export async function resolvePlayableArticles(
  articles: ArticleSummary[],
  article: ApiClient['article'],
): Promise<PlaybackItem[]> {
  const seen = new Set<string>();
  const unique = articles.filter(
    (entry) => !seen.has(entry.id) && Boolean(seen.add(entry.id)),
  );
  const resolved = await Promise.all(
    unique.map(async (entry) => {
      if (entry.audioUrl) return articleToPlaybackItem(entry);
      try {
        return articleToPlaybackItem(await article(entry.id));
      } catch {
        return null;
      }
    }),
  );
  return resolved.filter((item): item is PlaybackItem => item !== null);
}
