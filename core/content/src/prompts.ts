import type { Language } from '@lexiai/database'
import type { WordGrounding } from './stage-slices'

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
    'Return: tiers — quick, everyday, deep, and cultural readings (each a body sentence + example',
    'sentences with a register); relations — synonyms, antonyms, and the word family; and',
    'translations into a few major languages (languageName + term).',
  ].join('\n')

/**
 * The `enrich_visuals` text step: a *plan* of the visuals to render — one hero, one infographic, and a
 * few memes — each carrying a rich image `prompt`/`concept`/`caption` but `imageKey: null` (the engine
 * fills the keys after it renders each prompt to storage). `hero`/`infographic` may be `null` when no
 * such visual fits the word.
 */
export const enrichVisualsPrompt = (
  language: Language,
  word: string,
  grounding?: WordGrounding,
): string =>
  groundedSense(grounding) +
  [
    `You are an art director planning illustrations for the ${language} word "${word}".`,
    'Return visuals: a hero (one striking lead image), an infographic (a visual, symbolic breakdown —',
    'not a worded diagram), and a few memes — each with kind, a vivid image-generation prompt, a',
    'concept, and an optional caption. Every prompt must describe a PURE illustration with NO text, letters,',
    'or words rendered inside the image — caption and concept are separate text fields the UI overlays.',
    'Set every imageKey to null; the keys are assigned after rendering. Use null for hero or',
    'infographic if none fits.',
  ].join('\n')

/**
 * The `enrich_authors` text step: notable authors who used the word plus a cultural guide. Each
 * author carries `authorImageUrl: null` (the engine renders a portrait per author after this step and
 * fills the keys). The model must mark a fabricated quote `isGenerated: true` and only set
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
    'language, isGenerated, quote); set authorImageUrl to null (portraits are rendered after). Mark a',
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
