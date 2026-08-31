import type { ExtractionOutput } from './index.ts';
import type { BurmeseDraftFields } from './humanization.ts';

export const AUDIO_SCRIPT_PROMPT_ID = 'burmese-audio-script';
export const AUDIO_SCRIPT_PROMPT_VERSION = '1.0.0';
export const AUDIO_SCRIPT_VERIFICATION_PROMPT_ID =
  'burmese-audio-script-verification';
export const AUDIO_SCRIPT_VERIFICATION_PROMPT_VERSION = '1.0.0';

export type PronunciationDictionary = Readonly<Record<string, string>>;

/** Editorial defaults; callers can add or override entries when building a prompt. */
export const INTERNATIONAL_ENTITY_PRONUNCIATIONS = {
  ASEAN: 'အာဆီယံ',
  EU: 'ဥရောပ သမဂ္ဂ',
  NATO: 'နေတိုး',
  UN: 'ကုလသမဂ္ဂ',
  UNICEF: 'ယူနီဆက်',
  WHO: 'ကမ္ဘာ့ကျန်းမာရေး အဖွဲ့',
} as const satisfies PronunciationDictionary;

const nonWord = '[^\\p{L}\\p{M}\\p{N}_]';
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replaces only whole Unicode tokens. Longer keys win; equal-length keys use
 * code-point order, so dictionary insertion order can never change the result.
 */
export function applyPronunciationDictionary(
  input: string,
  dictionary: PronunciationDictionary = INTERNATIONAL_ENTITY_PRONUNCIATIONS,
): string {
  const entries = Object.entries(dictionary)
    .filter(([term, spoken]) => term.length > 0 && spoken.trim().length > 0)
    .sort(([left], [right]) =>
      right.length === left.length
        ? left < right
          ? -1
          : left > right
            ? 1
            : 0
        : right.length - left.length,
    );
  return entries.reduce((result, [term, spoken]) => {
    const boundary = new RegExp(
      `(^|${nonWord})(${escapeRegExp(term)})(?=$|${nonWord})`,
      'gu',
    );
    return result.replace(
      boundary,
      (_match, prefix: string) => prefix + spoken,
    );
  }, input);
}

export interface AudioScriptOutput {
  audio_script_mm: string;
}

export const AUDIO_SCRIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['audio_script_mm'],
  properties: {
    audio_script_mm: {
      type: 'string',
      minLength: 1,
      pattern: '[\\u1000-\\u109F]',
    },
  },
} as const;

/** A conservative transport check; factual checks belong to the second pass. */
export function isAudioScriptOutput(
  value: unknown,
): value is AudioScriptOutput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 1 &&
    typeof record.audio_script_mm === 'string' &&
    record.audio_script_mm.trim().length > 0 &&
    /[\u1000-\u109f]/u.test(record.audio_script_mm) &&
    !/https?:\/\/|www\./iu.test(record.audio_script_mm) &&
    !/(^|\n)\s{0,3}(?:#{1,6}|>|[-+*]\s|\d+[.)]\s)/u.test(
      record.audio_script_mm,
    ) &&
    !/[`*_~<>[\]{}|]/u.test(record.audio_script_mm)
  );
}

export function buildAudioScriptPrompt(
  clusterId: string,
  verifiedContent: BurmeseDraftFields,
  dictionary: PronunciationDictionary = INTERNATIONAL_ENTITY_PRONUNCIATIONS,
): string {
  return `Prompt ${AUDIO_SCRIPT_PROMPT_ID}@${AUDIO_SCRIPT_PROMPT_VERSION}
Create a concise, professional Burmese spoken-news script for story cluster ${clusterId}, lasting approximately two to five minutes at a normal newsreader pace.

VERIFIED_CONTENT is the complete and only factual source. Preserve its meaning, names, dates, quantities, units, attribution, qualifications, uncertainty, and material disagreements. Do not add facts or imply certainty. Lead with the central development, use short natural sentences and transitions, and omit repetition or nonessential background.

Output speech-ready plain text only inside the JSON field audio_script_mm. Remove Markdown formatting, URLs, citation markers, emoji, bullets, headings, and symbols that sound awkward when spoken. Expand abbreviations and render dates, currencies, percentages, ranges, decimals, and other quantities in unambiguous pronounceable Burmese without changing their values or precision.

Apply PRONUNCIATIONS as exact, case-sensitive whole Unicode-token substitutions. A boundary is the start or end of text, or a character outside Unicode Letter, Mark, Number, and underscore. Longer keys take precedence; equal-length keys use code-point order. Never replace a key inside another word. The dictionary is editorial and may include overrides.

Return JSON only, with exactly one non-empty field: audio_script_mm. Do not include production notes, labels, stage directions, Markdown, or a URL.

PRONUNCIATIONS:
${JSON.stringify(dictionary)}

VERIFIED_CONTENT:
${JSON.stringify(verifiedContent)}`;
}

export const AUDIO_SCRIPT_CHECKS = [
  'names',
  'dates',
  'numbers',
  'attribution',
  'uncertainty',
] as const;
export type AudioScriptCheck = (typeof AUDIO_SCRIPT_CHECKS)[number];
export interface AudioScriptVerificationOutput {
  passed: boolean;
  checks: Record<AudioScriptCheck, boolean>;
  errors: string[];
}

export const AUDIO_SCRIPT_VERIFICATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['passed', 'checks', 'errors'],
  properties: {
    passed: { type: 'boolean' },
    checks: {
      type: 'object',
      additionalProperties: false,
      required: AUDIO_SCRIPT_CHECKS,
      properties: Object.fromEntries(
        AUDIO_SCRIPT_CHECKS.map((check) => [check, { type: 'boolean' }]),
      ),
    },
    errors: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
} as const;

export function isAudioScriptVerificationOutput(
  value: unknown,
): value is AudioScriptVerificationOutput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const result = value as Record<string, unknown>;
  const checks = result.checks as Record<string, unknown> | undefined;
  const validChecks =
    checks !== undefined &&
    typeof checks === 'object' &&
    !Array.isArray(checks) &&
    Object.keys(checks).length === AUDIO_SCRIPT_CHECKS.length &&
    AUDIO_SCRIPT_CHECKS.every((check) => typeof checks[check] === 'boolean');
  const errors = result.errors;
  return (
    Object.keys(result).length === 3 &&
    typeof result.passed === 'boolean' &&
    validChecks &&
    Array.isArray(errors) &&
    errors.every(
      (error) => typeof error === 'string' && error.trim().length > 0,
    ) &&
    result.passed ===
      (errors.length === 0 &&
        AUDIO_SCRIPT_CHECKS.every((check) => checks[check] === true))
  );
}

export function buildAudioScriptVerificationPrompt(
  clusterId: string,
  extraction: ExtractionOutput,
  verifiedContent: BurmeseDraftFields,
  audioScript: string,
): string {
  return `Prompt ${AUDIO_SCRIPT_VERIFICATION_PROMPT_ID}@${AUDIO_SCRIPT_VERIFICATION_PROMPT_VERSION}
Before text-to-speech queueing, independently compare AUDIO_SCRIPT_MM with VERIFIED_CONTENT and EXTRACTED_FACTS for story cluster ${clusterId}. Re-check every name, date, number and unit, attribution, and expression of uncertainty. Omission for concision is allowed only when it does not distort meaning. Any changed, unsupported, strengthened, weakened, or ambiguously pronounced item fails its check.

Return JSON only with exactly passed, checks, and errors. checks must contain exactly names, dates, numbers, attribution, and uncertainty as booleans. List a precise error for every failure. passed must be true if and only if every check is true and errors is empty. Do not repair the script. A failed result must not be queued for text-to-speech.

EXTRACTED_FACTS:
${JSON.stringify(extraction)}

VERIFIED_CONTENT:
${JSON.stringify(verifiedContent)}

AUDIO_SCRIPT_MM:
${JSON.stringify(audioScript)}`;
}
