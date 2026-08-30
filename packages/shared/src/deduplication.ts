import { canonicalizeUrl, normalizeTitle } from './index.ts';

/** Inputs used to decide whether two source articles describe the same story. */
export interface DeduplicationArticle {
  id: string;
  canonicalUrl: string;
  title: string;
  contentHash?: string;
  publishedAt?: string;
}

export const DEDUPLICATION_THRESHOLDS = Object.freeze({
  /** Safe for automatic cluster membership. */
  highConfidence: 0.82,
  /** Retain for human or AI comparison, but do not cluster automatically. */
  ambiguous: 0.58,
} as const);

export type DeduplicationDecision =
  'high-confidence' | 'ambiguous' | 'separate-story';

export interface ScoreSignal {
  value: number;
  weight: number;
  contribution: number;
  explanation: string;
}

export interface DeduplicationScore {
  score: number;
  decision: DeduplicationDecision;
  signals: {
    canonicalUrl: ScoreSignal;
    normalizedTitle: ScoreSignal;
    contentHash: ScoreSignal;
    publicationTime: ScoreSignal;
    namedTokenOverlap: ScoreSignal;
    headlineTokenSimilarity: ScoreSignal;
  };
}

const WORDS = /[\p{L}\p{N}]+/gu;
const weights = {
  canonicalUrl: 0.3,
  normalizedTitle: 0.2,
  contentHash: 0.25,
  publicationTime: 0.15,
  namedTokenOverlap: 0.35,
  headlineTokenSimilarity: 0.5,
} as const;
const stopWords = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'the',
  'to',
  'with',
  'after',
  'new',
  'says',
  'over',
]);

const tokens = (title: string): string[] =>
  (normalizeTitle(title).toLocaleLowerCase('en-US').match(WORDS) ?? []).filter(
    (word) => !stopWords.has(word),
  );

const normalizedTitleKey = (title: string): string => tokens(title).join(' ');

const namedTokens = (title: string): string[] => {
  const words = normalizeTitle(title).match(WORDS) ?? [];
  return words
    .filter(
      (word, index) =>
        /\d/u.test(word) ||
        /^[A-Z]{2,}$/u.test(word) ||
        (index > 0 && /^\p{Lu}[\p{L}\p{M}'’-]*$/u.test(word)),
    )
    .map((word) => word.toLocaleLowerCase('en-US'));
};

const jaccard = (left: string[], right: string[]): number => {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size && !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / (a.size + b.size - intersection);
};

const signal = (
  value: number,
  weight: number,
  explanation: string,
): ScoreSignal => ({
  value,
  weight,
  contribution: value * weight,
  explanation,
});

/**
 * Produces a deterministic, explainable score. Scores >= 0.82 are
 * high-confidence matches, 0.58–0.819999 are ambiguous, and scores below 0.58
 * are separate stories. Exact canonical URLs, normalized titles, or content
 * hashes receive enough corroborating credit to be treated as exact duplicates.
 */
export function scoreDuplicate(
  left: DeduplicationArticle,
  right: DeduplicationArticle,
): DeduplicationScore {
  const urlEqual =
    canonicalizeUrl(left.canonicalUrl) === canonicalizeUrl(right.canonicalUrl);
  const titleEqual =
    normalizedTitleKey(left.title) === normalizedTitleKey(right.title);
  const hashEqual = Boolean(
    left.contentHash &&
    right.contentHash &&
    left.contentHash === right.contentHash,
  );
  const leftTime = left.publishedAt ? Date.parse(left.publishedAt) : NaN;
  const rightTime = right.publishedAt ? Date.parse(right.publishedAt) : NaN;
  const hours =
    Number.isFinite(leftTime) && Number.isFinite(rightTime)
      ? Math.abs(leftTime - rightTime) / 3_600_000
      : undefined;
  const proximity =
    hours === undefined
      ? 0
      : hours <= 6
        ? 1
        : hours <= 24
          ? 0.7
          : hours <= 72
            ? 0.25
            : 0;
  const namedOverlap = jaccard(
    namedTokens(left.title),
    namedTokens(right.title),
  );
  const headlineSimilarity = jaccard(tokens(left.title), tokens(right.title));

  const signals = {
    canonicalUrl: signal(
      Number(urlEqual),
      weights.canonicalUrl,
      urlEqual ? 'Canonical URLs are equal.' : 'Canonical URLs differ.',
    ),
    normalizedTitle: signal(
      Number(titleEqual),
      weights.normalizedTitle,
      titleEqual ? 'Normalized titles are equal.' : 'Normalized titles differ.',
    ),
    contentHash: signal(
      Number(hashEqual),
      weights.contentHash,
      hashEqual
        ? 'Content hashes are equal.'
        : 'Content hashes differ or are unavailable.',
    ),
    publicationTime: signal(
      proximity,
      weights.publicationTime,
      hours === undefined
        ? 'Publication-time proximity is unavailable.'
        : `Published ${hours.toFixed(1)} hours apart.`,
    ),
    namedTokenOverlap: signal(
      namedOverlap,
      weights.namedTokenOverlap,
      `Named-token overlap is ${(namedOverlap * 100).toFixed(0)}%.`,
    ),
    headlineTokenSimilarity: signal(
      headlineSimilarity,
      weights.headlineTokenSimilarity,
      `Headline-token similarity is ${(headlineSimilarity * 100).toFixed(0)}%.`,
    ),
  };
  let score = Math.min(
    1,
    Object.values(signals).reduce((sum, item) => sum + item.contribution, 0),
  );
  // Equality signals are definitive identifiers, while still retaining the
  // component score and explanation that caused this bounded floor.
  if (urlEqual || titleEqual || hashEqual)
    score = Math.max(score, DEDUPLICATION_THRESHOLDS.highConfidence);
  score = Math.round(score * 10_000) / 10_000;
  const decision =
    score >= DEDUPLICATION_THRESHOLDS.highConfidence
      ? 'high-confidence'
      : score >= DEDUPLICATION_THRESHOLDS.ambiguous
        ? 'ambiguous'
        : 'separate-story';
  return { score, decision, signals };
}

export interface ClusterCandidate {
  clusterId: string;
  article: DeduplicationArticle;
}

export interface ClusterRecommendation {
  clusterId: string;
  score: DeduplicationScore;
}

/** Selects membership only for a high-confidence best match; ambiguous matches remain recommendations. */
export function recommendCluster(
  article: DeduplicationArticle,
  candidates: ClusterCandidate[],
): { automatic?: ClusterRecommendation; review: ClusterRecommendation[] } {
  const ranked = candidates
    .map(({ clusterId, article: candidate }) => ({
      clusterId,
      score: scoreDuplicate(article, candidate),
    }))
    .sort((a, b) => b.score.score - a.score.score);
  const automatic = ranked.find(
    (candidate) => candidate.score.decision === 'high-confidence',
  );
  return {
    ...(automatic ? { automatic } : {}),
    review: ranked.filter(
      (candidate) => candidate.score.decision === 'ambiguous',
    ),
  };
}

/** Persistence boundary implemented with story_cluster_articles and story_cluster_candidates. */
export interface DeduplicationStore {
  addStoryClusterArticle(input: {
    clusterId: string;
    articleId: string;
    similarityScore: number;
    matchExplanation: string;
  }): Promise<void>;
  addStoryClusterCandidate(input: {
    clusterId: string;
    articleId: string;
    similarityScore: number;
    matchExplanation: string;
  }): Promise<void>;
}

const explain = (score: DeduplicationScore): string =>
  JSON.stringify({
    decision: score.decision,
    threshold: DEDUPLICATION_THRESHOLDS,
    signals: score.signals,
  });

/** Persists only confident membership and queues every ambiguous comparison for review. */
export async function persistClusterRecommendation(
  store: DeduplicationStore,
  articleId: string,
  recommendation: ReturnType<typeof recommendCluster>,
): Promise<void> {
  if (recommendation.automatic) {
    await store.addStoryClusterArticle({
      clusterId: recommendation.automatic.clusterId,
      articleId,
      similarityScore: recommendation.automatic.score.score,
      matchExplanation: explain(recommendation.automatic.score),
    });
  }
  await Promise.all(
    recommendation.review.map((candidate) =>
      store.addStoryClusterCandidate({
        clusterId: candidate.clusterId,
        articleId,
        similarityScore: candidate.score.score,
        matchExplanation: explain(candidate.score),
      }),
    ),
  );
}
