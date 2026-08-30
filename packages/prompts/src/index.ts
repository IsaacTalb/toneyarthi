export const EXTRACTION_PROMPT_ID = 'story-extraction';
export const EXTRACTION_PROMPT_VERSION = '1.0.0';

const evidenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['articleId', 'excerpt'],
  properties: {
    articleId: { type: 'string', minLength: 1 },
    excerpt: { type: 'string', minLength: 1 },
  },
} as const;

const evidencedText = (field: string) => ({
  type: 'object',
  additionalProperties: false,
  required: [field, 'evidence'],
  properties: {
    [field]: { type: 'string', minLength: 1 },
    evidence: { type: 'array', minItems: 1, items: evidenceSchema },
  },
});

/** Strict JSON schema sent to the model and mirrored by the runtime validator. */
export const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'people',
    'organizations',
    'countries',
    'locations',
    'dates',
    'numbers',
    'confirmedFacts',
    'attributedClaims',
    'uncertainFacts',
    'sourceDisagreements',
  ],
  properties: {
    people: { type: 'array', items: evidencedText('name') },
    organizations: { type: 'array', items: evidencedText('name') },
    countries: { type: 'array', items: evidencedText('name') },
    locations: { type: 'array', items: evidencedText('name') },
    dates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'normalized', 'evidence'],
        properties: {
          text: { type: 'string', minLength: 1 },
          normalized: { type: ['string', 'null'] },
          evidence: { type: 'array', minItems: 1, items: evidenceSchema },
        },
      },
    },
    numbers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'value', 'unit', 'evidence'],
        properties: {
          text: { type: 'string', minLength: 1 },
          value: { type: ['number', 'null'] },
          unit: { type: ['string', 'null'] },
          evidence: { type: 'array', minItems: 1, items: evidenceSchema },
        },
      },
    },
    confirmedFacts: { type: 'array', items: evidencedText('statement') },
    attributedClaims: {
      type: 'array',
      items: {
        ...evidencedText('statement'),
        required: ['statement', 'attributedTo', 'evidence'],
        properties: {
          ...evidencedText('statement').properties,
          attributedTo: { type: 'string', minLength: 1 },
        },
      },
    },
    uncertainFacts: {
      type: 'array',
      items: {
        ...evidencedText('statement'),
        required: ['statement', 'uncertainty', 'evidence'],
        properties: {
          ...evidencedText('statement').properties,
          uncertainty: { type: 'string', minLength: 1 },
        },
      },
    },
    sourceDisagreements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['topic', 'positions'],
        properties: {
          topic: { type: 'string', minLength: 1 },
          positions: {
            type: 'array',
            minItems: 2,
            items: evidencedText('statement'),
          },
        },
      },
    },
  },
} as const;

export interface ExtractionEvidence {
  articleId: string;
  excerpt: string;
}
export interface EvidencedName {
  name: string;
  evidence: ExtractionEvidence[];
}
export interface EvidencedStatement {
  statement: string;
  evidence: ExtractionEvidence[];
}
export interface ExtractionOutput {
  people: EvidencedName[];
  organizations: EvidencedName[];
  countries: EvidencedName[];
  locations: EvidencedName[];
  dates: Array<{
    text: string;
    normalized: string | null;
    evidence: ExtractionEvidence[];
  }>;
  numbers: Array<{
    text: string;
    value: number | null;
    unit: string | null;
    evidence: ExtractionEvidence[];
  }>;
  confirmedFacts: EvidencedStatement[];
  attributedClaims: Array<EvidencedStatement & { attributedTo: string }>;
  uncertainFacts: Array<EvidencedStatement & { uncertainty: string }>;
  sourceDisagreements: Array<{
    topic: string;
    positions: EvidencedStatement[];
  }>;
}

type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exact = (value: RecordValue, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => key in value);
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const evidence = (
  value: unknown,
  articleIds?: ReadonlySet<string>,
): value is ExtractionEvidence[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (item) =>
      object(item) &&
      exact(item, ['articleId', 'excerpt']) &&
      text(item.articleId) &&
      text(item.excerpt) &&
      (!articleIds || articleIds.has(item.articleId)),
  );
const named = (value: unknown, articleIds?: ReadonlySet<string>) =>
  object(value) &&
  exact(value, ['name', 'evidence']) &&
  text(value.name) &&
  evidence(value.evidence, articleIds);
const statement = (value: unknown, articleIds?: ReadonlySet<string>) =>
  object(value) &&
  exact(value, ['statement', 'evidence']) &&
  text(value.statement) &&
  evidence(value.evidence, articleIds);
const arrayOf = (value: unknown, check: (item: unknown) => boolean) =>
  Array.isArray(value) && value.every(check);

/** Rejects extra keys, empty evidence, invalid types, and evidence from outside the cluster. */
export function isExtractionOutput(
  value: unknown,
  articleIds?: ReadonlySet<string>,
): value is ExtractionOutput {
  const keys = [
    'people',
    'organizations',
    'countries',
    'locations',
    'dates',
    'numbers',
    'confirmedFacts',
    'attributedClaims',
    'uncertainFacts',
    'sourceDisagreements',
  ];
  if (!object(value) || !exact(value, keys)) return false;
  const namesValid = [
    'people',
    'organizations',
    'countries',
    'locations',
  ].every((key) => arrayOf(value[key], (item) => named(item, articleIds)));
  return (
    namesValid &&
    arrayOf(
      value.dates,
      (item) =>
        object(item) &&
        exact(item, ['text', 'normalized', 'evidence']) &&
        text(item.text) &&
        (item.normalized === null || text(item.normalized)) &&
        evidence(item.evidence, articleIds),
    ) &&
    arrayOf(
      value.numbers,
      (item) =>
        object(item) &&
        exact(item, ['text', 'value', 'unit', 'evidence']) &&
        text(item.text) &&
        (item.value === null ||
          (typeof item.value === 'number' && Number.isFinite(item.value))) &&
        (item.unit === null || text(item.unit)) &&
        evidence(item.evidence, articleIds),
    ) &&
    arrayOf(value.confirmedFacts, (item) => statement(item, articleIds)) &&
    arrayOf(
      value.attributedClaims,
      (item) =>
        object(item) &&
        exact(item, ['statement', 'attributedTo', 'evidence']) &&
        text(item.statement) &&
        text(item.attributedTo) &&
        evidence(item.evidence, articleIds),
    ) &&
    arrayOf(
      value.uncertainFacts,
      (item) =>
        object(item) &&
        exact(item, ['statement', 'uncertainty', 'evidence']) &&
        text(item.statement) &&
        text(item.uncertainty) &&
        evidence(item.evidence, articleIds),
    ) &&
    arrayOf(
      value.sourceDisagreements,
      (item) =>
        object(item) &&
        exact(item, ['topic', 'positions']) &&
        text(item.topic) &&
        Array.isArray(item.positions) &&
        item.positions.length >= 2 &&
        item.positions.every((position) => statement(position, articleIds)),
    )
  );
}

export interface ExtractionArticle {
  id: string;
  title: string;
  body: string;
  sourceName: string;
  canonicalUrl: string;
  publishedAt: string | null;
}

export function buildExtractionPrompt(
  clusterId: string,
  articles: readonly ExtractionArticle[],
): string {
  const documents = articles.map((article) => ({
    articleId: article.id,
    sourceName: article.sourceName,
    url: article.canonicalUrl,
    publishedAt: article.publishedAt,
    title: article.title,
    body: article.body,
  }));
  return `Prompt ${EXTRACTION_PROMPT_ID}@${EXTRACTION_PROMPT_VERSION}\nExtract only information supported by the normalized articles in story cluster ${clusterId}. Do not reconcile differing reports into a single fact. Put statements explicitly made by a person or organization in attributedClaims, qualified or unverified material in uncertainFacts, and incompatible source accounts in sourceDisagreements. Every item and every disagreement position must include one or more evidence entries. articleId must exactly match a supplied articleId; excerpt must be a short verbatim supporting passage. Return JSON only and use empty arrays when a category has no support.\n\nARTICLES:\n${JSON.stringify(documents)}`;
}
