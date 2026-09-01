export interface BriefingConfig {
  minStories: number;
  maxStories: number;
  lookbackHours: number;
  importanceWeight: number;
  recencyWeight: number;
  categoryDiversityWeight: number;
}

export interface Candidate {
  articleId: string;
  clusterId: string;
  categoryId: string | null;
  publishedAt: string;
  importance: number;
}

export interface Selection extends Candidate {
  score: number;
  reason: {
    importance: number;
    recency: number;
    categoryDiversity: number;
    total: number;
    clusterId: string;
  };
}

export const DEFAULT_CONFIG: BriefingConfig = {
  minStories: 5,
  maxStories: 8,
  lookbackHours: 36,
  importanceWeight: 0.45,
  recencyWeight: 0.35,
  categoryDiversityWeight: 0.2,
};

export function parseConfig(value?: string): BriefingConfig {
  const parsed = value ? (JSON.parse(value) as Partial<BriefingConfig>) : {};
  const config = { ...DEFAULT_CONFIG, ...parsed };
  if (
    !Number.isInteger(config.minStories) ||
    !Number.isInteger(config.maxStories) ||
    config.minStories < 5 ||
    config.maxStories > 8 ||
    config.minStories > config.maxStories ||
    config.lookbackHours <= 0 ||
    config.importanceWeight < 0 ||
    config.recencyWeight < 0 ||
    config.categoryDiversityWeight < 0
  )
    throw new Error('Invalid BRIEFING_CONFIG');
  return config;
}

export function selectStories(
  candidates: Candidate[],
  config: BriefingConfig,
  now: Date,
): Selection[] {
  // SQL normally returns one article per cluster; this map is the final guard.
  const unique = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const prior = unique.get(candidate.clusterId);
    if (!prior || candidate.importance > prior.importance)
      unique.set(candidate.clusterId, candidate);
  }
  const remaining = [...unique.values()];
  const selected: Selection[] = [];
  const categories = new Set<string>();
  while (remaining.length && selected.length < config.maxStories) {
    const scored = remaining.map((candidate) => {
      const ageHours = Math.max(
        0,
        (now.getTime() - Date.parse(candidate.publishedAt)) / 3_600_000,
      );
      const recency = Math.max(0, 1 - ageHours / config.lookbackHours);
      const diversity =
        candidate.categoryId && !categories.has(candidate.categoryId) ? 1 : 0;
      const total =
        candidate.importance * config.importanceWeight +
        recency * config.recencyWeight +
        diversity * config.categoryDiversityWeight;
      return {
        ...candidate,
        score: total,
        reason: {
          importance: candidate.importance,
          recency,
          categoryDiversity: diversity,
          total,
          clusterId: candidate.clusterId,
        },
      };
    });
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(b.publishedAt) - Date.parse(a.publishedAt) ||
        a.articleId.localeCompare(b.articleId),
    );
    const winner = scored[0];
    selected.push(winner);
    if (winner.categoryId) categories.add(winner.categoryId);
    remaining.splice(
      remaining.findIndex((item) => item.clusterId === winner.clusterId),
      1,
    );
  }
  return selected;
}
