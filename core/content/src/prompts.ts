import { LANGUAGES, type Language } from '@lexiai/database'
import type { WordGrounding } from './stage-slices'

/** The translation target codes the model must use, rendered into the `enrich_tiers` prompt. */
const TRANSLATION_CODES = LANGUAGES.join(', ')

/**
 * Prompt templates for the real engine, one named builder per stage. Kept as a separate data module
 * (not inlined in the handlers) so a later provenance task can hash a template verbatim into
 * `sourceVersions.promptHash` without reaching into the engine's control flow.
 */

/**
 * Optional Wikipedia facts passed to {@link fetchSourcePrompt} — already best-effort upstream. Named
 * `WikiFacts` (not `…Grounding`) to stay distinct from {@link WordGrounding}: this is the raw source
 * input to `fetch_source`, whereas `WordGrounding` is the curated sense `fetch_source` *produces* and
 * feeds downstream.
 */
export interface WikiFacts {
  readonly extract?: string
  readonly description?: string
}

/**
 * The grounded-sense line every enrich stage prepends — the {@link WordGrounding} `fetch_source`
 * produced — so each stage reasons about the *same* reading of a polysemous word. Empty when no
 * grounding is available (the stage falls back to its own lexical knowledge).
 */
const groundedSense = (grounding: WordGrounding | undefined): string =>
  grounding === undefined
    ? ''
    : `Grounded sense (do not contradict): ${grounding.coreDefinition} [${grounding.lexical.partOfSpeech}]\n`

/**
 * The `fetch_source` prompt: definition + lexical + pronunciation + sources for one word. Any provided
 * Wikipedia facts are to be used verbatim; the model must never fabricate IPA or attestation, and must
 * flag a non-word via `isReal: false` rather than inventing an entry.
 */
export const fetchSourcePrompt = (
  language: Language,
  word: string,
  grounding: WikiFacts | undefined,
): string => {
  const facts =
    grounding === undefined
      ? 'No reference facts were found. Do not fabricate IPA, etymology, or attestation.'
      : [
          'Reference facts (use verbatim, do not contradict):',
          grounding.extract && `- Extract: ${grounding.extract}`,
          grounding.description && `- Description: ${grounding.description}`,
        ]
          .filter(Boolean)
          .join('\n')

  return [
    `You are a lexicographer producing the source layer for the ${language} word "${word}".`,
    'Return: a one-sentence coreDefinition, lexical data (part of speech, register), pronunciation',
    '(IPA; a respelling; audio keys null), and the sources you relied on.',
    `Set isReal=false if "${word}" is not a real ${language} word; otherwise isReal=true.`,
    'Never invent IPA or citations you cannot ground.',
    '',
    facts,
  ].join('\n')
}

/**
 * The `enrich_etymology` prompt: the word's origin and attested descent. Text-only — no Wikipedia
 * grounding (that lives in `fetch_source`); the model reasons from its own lexical knowledge and
 * must flag uncertainty in prose rather than inventing precise dates it cannot defend.
 */
export const enrichEtymologyPrompt = (
  language: Language,
  word: string,
  grounding?: WordGrounding,
): string =>
  groundedSense(grounding) +
  [
    `You are an etymologist tracing the origin of the ${language} word "${word}".`,
    'Return an etymology: a summary sentence, the first attestation (year + language), the origin',
    '(from/to/gloss), and a descent chain of attested forms (when, form, languageName, gloss;',
    'citation index optional). Prefer "uncertain" in prose over a fabricated precise date.',
  ].join('\n')

/**
 * The `enrich_tiers` prompt: the four depths of meaning plus lexical relations and translations.
 * Text-only. The four tiers (quick, everyday, deep, cultural) are the UF-002 word-card structure.
 */
export const enrichTiersPrompt = (
  language: Language,
  word: string,
  grounding?: WordGrounding,
): string =>
  groundedSense(grounding) +
  [
    `You are a lexicographer writing the meaning layer for the ${language} word "${word}".`,
    'Return: tiers — quick, everyday, deep, and cultural readings. For EACH tier write a body that',
    'explains the meaning in prose ONLY — do NOT put example sentences inside body — and provide',
    'EXACTLY 3 entries in that tier’s examples array, each an object { text, register } where text',
    "is a full sentence using the word and register names its tone (e.g. 'everyday', 'formal',",
    "'literary'). Also return relations — synonyms, antonyms, and the word family — and translations,",
    'each { language, term } where language is the ISO 639-1 code and term is the headword in that',
    `language. Provide one for each of: ${TRANSLATION_CODES} — skipping the word's own language (${language}).`,
  ].join('\n')

/**
 * The `enrich_visuals` text step: a *plan* of the visuals to render — always a hero and an infographic,
 * plus exactly 3 memes — each carrying a rich image `prompt`/`concept`/`caption` but **no** image key
 * (the plan schema omits it; the engine renders each prompt to storage and fills the key after).
 */
export const enrichVisualsPrompt = (
  language: Language,
  word: string,
  grounding?: WordGrounding,
): string =>
  groundedSense(grounding) +
  [
    `You are an art director planning illustrations for the ${language} word "${word}".`,
    'Return visuals: ALWAYS a hero (one striking lead image) AND an infographic (a visual, symbolic',
    'breakdown — not a worded diagram), plus EXACTLY 3 memes — each with kind, a vivid',
    'image-generation prompt, a concept, and an optional caption. Every prompt must describe a PURE',
    'illustration with NO text, letters, or words rendered inside the image — caption and concept are',
    'separate text fields the UI overlays. Do not include image keys; they are assigned after rendering.',
  ].join('\n')

/**
 * The `enrich_authors` text step: notable authors who used the word plus a cultural guide. Each author
 * carries **no** image key (the plan schema omits it; the engine renders a portrait per author after
 * this step and fills the key). The model must mark a fabricated quote `isGenerated: true` and only set
 * `isGenerated: false` for a genuinely attested one it can defend.
 */
export const enrichAuthorsPrompt = (
  language: Language,
  word: string,
  grounding?: WordGrounding,
): string =>
  groundedSense(grounding) +
  [
    `You are a literary scholar gathering how the ${language} word "${word}" has been used.`,
    'Return authorExamples — notable authors with a quote using the word (author, optional work,',
    'language, isGenerated, quote); do not include an image key (portraits are rendered after). Mark a',
    'fabricated quote isGenerated=true; reserve isGenerated=false for an attested one you can defend.',
    'Also return a culturalGuide: a short timeline (date + text), an optional 2030 forecast, and notes.',
  ].join('\n')

/**
 * The `final_review` prompt: the word's usage frequency. Text-only; the last text pass, producing the
 * frequency band and (optionally) a trend series the word card renders.
 */
export const finalReviewPrompt = (
  language: Language,
  word: string,
  grounding?: WordGrounding,
): string =>
  groundedSense(grounding) +
  [
    `You are a corpus linguist assessing how common the ${language} word "${word}" is.`,
    'Return a frequency: a band (how common), an optional trend note, a yearly series',
    '(year + value; empty if you have no data), and an optional change note. Estimate conservatively; do not invent exact counts.',
  ].join('\n')

/**
 * The author **portrait** image prompt — a text-free likeness of one author, rendered after the
 * `enrich_authors` text step fills `authorExamples`. A named builder like the text prompts (not inlined
 * in the engine) so its template text rides `sourceVersions.promptHash` alongside them — a reword shifts
 * provenance.
 */
export const authorPortraitPrompt = (author: string): string => `Portrait of ${author}.`
