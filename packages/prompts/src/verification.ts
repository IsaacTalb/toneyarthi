import type { ExtractionOutput } from './index.ts';
import type { BurmeseDraftFields } from './humanization.ts';

export const VERIFICATION_PROMPT_ID = 'burmese-story-verification';
export const VERIFICATION_PROMPT_VERSION = '1.0.0';
export const VERIFICATION_CORRECTION_PROMPT_ID =
  'burmese-story-verification-correction';
export const VERIFICATION_CORRECTION_PROMPT_VERSION = '1.0.0';

export const VERIFICATION_ERROR_TYPES = [
  'INCORRECT_NAME',
  'INCORRECT_NUMBER',
  'INCORRECT_CURRENCY',
  'INCORRECT_DATE',
  'INCORRECT_LOCATION',
  'INCORRECT_ORGANIZATION',
  'UNSUPPORTED_CLAIM',
  'ATTRIBUTION_LOSS',
  'CHANGED_UNCERTAINTY',
  'MISTRANSLATION',
  'EXAGGERATION',
] as const;
export type VerificationErrorType = (typeof VERIFICATION_ERROR_TYPES)[number];
export type VerificationSeverity = 'minor' | 'serious';

export interface VerificationError {
  type: VerificationErrorType;
  severity: VerificationSeverity;
  description: string;
}

export interface VerificationResult {
  passed: boolean;
  errors: VerificationError[];
}

export const VERIFICATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['passed', 'errors'],
  properties: {
    passed: { type: 'boolean' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'severity', 'description'],
        properties: {
          type: { type: 'string', enum: VERIFICATION_ERROR_TYPES },
          severity: { type: 'string', enum: ['minor', 'serious'] },
          description: { type: 'string', minLength: 1 },
        },
      },
    },
  },
} as const;

const errorTypes = new Set<string>(VERIFICATION_ERROR_TYPES);

/** Enforces both the JSON shape and the invariant that pass means no errors. */
export function isVerificationResult(
  value: unknown,
): value is VerificationResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const result = value as Record<string, unknown>;
  if (
    Object.keys(result).length !== 2 ||
    !('passed' in result) ||
    !('errors' in result) ||
    typeof result.passed !== 'boolean' ||
    !Array.isArray(result.errors)
  )
    return false;
  const validErrors = result.errors.every((candidate) => {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      Array.isArray(candidate)
    )
      return false;
    const error = candidate as Record<string, unknown>;
    return (
      Object.keys(error).length === 3 &&
      errorTypes.has(String(error.type)) &&
      (error.severity === 'minor' || error.severity === 'serious') &&
      typeof error.description === 'string' &&
      error.description.trim().length > 0
    );
  });
  return validErrors && result.passed === (result.errors.length === 0);
}

export interface VerificationInput {
  extraction: ExtractionOutput;
  sourceEvidence: readonly { articleId: string; title: string; body: string }[];
  content: BurmeseDraftFields;
}

export function buildVerificationPrompt(
  clusterId: string,
  input: VerificationInput,
): string {
  return `Prompt ${VERIFICATION_PROMPT_ID}@${VERIFICATION_PROMPT_VERSION}
Act as a strict factual verifier for story cluster ${clusterId}. Compare the Burmese content against BOTH the extracted fact ledger and its source evidence. Report every discrepancy involving names, numbers, currencies, dates, locations, organizations, unsupported claims, lost or changed attribution, strengthened or weakened uncertainty, mistranslation, or exaggeration.

Use severity "minor" only for a localized error that can be corrected without editorial judgment and without changing the story's substance. Use "serious" for unsupported substantive claims, conflicting identity/quantity/date, attribution or uncertainty changes, material mistranslation, exaggeration, or anything requiring judgment. Do not rewrite the article. A result passes if and only if errors is empty. Return JSON only with exactly passed and errors; each error must contain exactly type, severity, and a precise description identifying the content and evidence in conflict.

EXTRACTED_FACTS:
${JSON.stringify(input.extraction)}

SOURCE_EVIDENCE:
${JSON.stringify(input.sourceEvidence)}

HUMANIZED_BURMESE_CONTENT:
${JSON.stringify(input.content)}`;
}

export const VERIFICATION_CORRECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title_mm', 'summary_mm', 'content_mm'],
  properties: {
    title_mm: { type: 'string', minLength: 1, pattern: '[\\u1000-\\u109F]' },
    summary_mm: { type: 'string', minLength: 1, pattern: '[\\u1000-\\u109F]' },
    content_mm: { type: 'string', minLength: 1, pattern: '[\\u1000-\\u109F]' },
  },
} as const;

/** Builds the sole permitted correction request; its output must be verified again. */
export function buildVerificationCorrectionPrompt(
  clusterId: string,
  content: BurmeseDraftFields,
  errors: readonly VerificationError[],
): string {
  if (
    errors.length === 0 ||
    errors.some(({ severity }) => severity !== 'minor')
  )
    throw new Error(
      'A controlled correction requires one or more minor-only errors',
    );
  return `Prompt ${VERIFICATION_CORRECTION_PROMPT_ID}@${VERIFICATION_CORRECTION_PROMPT_VERSION}
Correct only the listed minor verification errors in the Burmese content for story cluster ${clusterId}. Make the smallest localized edits possible. Do not change any other wording, fact, name, number, currency, date, location, organization, attribution, uncertainty, or tone. Do not add claims. This correction may be performed only once and its output will be re-verified.

Return JSON only with exactly title_mm, summary_mm, and content_mm as non-empty Burmese strings.

MINOR_ERRORS:
${JSON.stringify(errors)}

CONTENT:
${JSON.stringify(content)}`;
}

export type VerificationRoute = 'TTS_PENDING' | 'CORRECT_ONCE' | 'NEEDS_REVIEW';

/** Technical failures are deliberately not represented here; callers route them to FAILED_VERIFICATION. */
export function routeVerification(
  result: VerificationResult,
  correctionUsed: boolean,
): VerificationRoute {
  if (result.passed) return 'TTS_PENDING';
  if (
    !correctionUsed &&
    result.errors.length > 0 &&
    result.errors.every(({ severity }) => severity === 'minor')
  )
    return 'CORRECT_ONCE';
  return 'NEEDS_REVIEW';
}
