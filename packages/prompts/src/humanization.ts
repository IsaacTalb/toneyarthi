export const BURMESE_HUMANIZATION_PROMPT_ID = 'burmese-humanization';
export const BURMESE_HUMANIZATION_PROMPT_VERSION = '1.0.0';

export interface BurmeseDraftFields {
  title_mm: string;
  summary_mm: string;
  content_mm: string;
}

/** A caller-supplied, immutable ledger against which the stylistic edit is made. */
export interface HumanizationImmutableFacts {
  facts: readonly string[];
  names: readonly string[];
  dates: readonly string[];
  numbers: readonly string[];
  quotations: readonly string[];
  attributions: readonly string[];
  uncertaintyMarkers: readonly string[];
}

export interface BurmeseHumanizationInput {
  draft: BurmeseDraftFields;
  immutable: HumanizationImmutableFacts;
}

export type BurmeseHumanizationOutput = BurmeseDraftFields;

export const BURMESE_HUMANIZATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title_mm', 'summary_mm', 'content_mm'],
  properties: {
    title_mm: { type: 'string', minLength: 1, pattern: '[\\u1000-\\u109F]' },
    summary_mm: { type: 'string', minLength: 1, pattern: '[\\u1000-\\u109F]' },
    content_mm: { type: 'string', minLength: 1, pattern: '[\\u1000-\\u109F]' },
  },
} as const;

const MYANMAR_TEXT = /[\u1000-\u109f]/u;
const nonemptyMyanmar = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  MYANMAR_TEXT.test(value);

/** Validates the exact persisted field set and requires Burmese in every field. */
export function isBurmeseHumanizationOutput(
  value: unknown,
): value is BurmeseHumanizationOutput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item);
  return (
    keys.length === 3 &&
    ['title_mm', 'summary_mm', 'content_mm'].every((key) => key in item) &&
    nonemptyMyanmar(item.title_mm) &&
    nonemptyMyanmar(item.summary_mm) &&
    nonemptyMyanmar(item.content_mm)
  );
}

/** Humanization is a constrained style edit, not another reporting stage. */
export function buildBurmeseHumanizationPrompt(
  clusterId: string,
  input: BurmeseHumanizationInput,
): string {
  return `Prompt ${BURMESE_HUMANIZATION_PROMPT_ID}@${BURMESE_HUMANIZATION_PROMPT_VERSION}
Humanize the Burmese draft for story cluster ${clusterId}. This is a style-only edit.

Make the Burmese read as if written by a skilled native news editor. Vary sentence length and cadence, improve transitions, and prefer direct, idiomatic constructions. Reduce repetitive formal filler, stock connective phrases, needless restatement, overly uniform sentences, and robotic word-for-word translation patterns. Keep the tone neutral and unsensational.

The IMMUTABLE ledger is binding. Preserve every fact, name, date, number, quotation, attribution, and uncertainty marker exactly in meaning and association. Do not add or infer a fact. Do not omit a fact from the draft, even for brevity. Do not strengthen or weaken certainty. Do not move a claim away from its speaker or source. Do not politically reframe language, introduce bias, choose a side, editorialize, or use sensational or emotionally inflated wording. Quotations must remain quotations and must not be invented or paraphrased as direct quotes. If naturalness conflicts with fidelity, preserve fidelity.

Return JSON only, with exactly title_mm, summary_mm, and content_mm. Each field must be a non-empty Burmese string. Do not include notes, a change log, or metadata.

PRE_HUMANIZED_DRAFT:
${JSON.stringify(input.draft)}

IMMUTABLE:
${JSON.stringify(input.immutable)}`;
}
