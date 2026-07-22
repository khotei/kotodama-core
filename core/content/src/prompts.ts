import { LANGUAGES, type Language } from '@kotodama/database'
import type { WordGrounding } from './stage-slices'

// One named builder per stage, kept as a data module (not inlined in handlers) so
// `provenance.promptHash` can hash each template verbatim.

/**
 * Raw Wikipedia facts fed INTO `fetch_source` — named `WikiFacts`, not `…Grounding`, to stay
 * distinct from {@link WordGrounding}, the curated sense `fetch_source` *produces*.
 */
export interface WikiFacts {
  readonly extract?: string
  readonly description?: string
}

const TRANSLATION_CODES = LANGUAGES.join(', ')

// Prepended by every enrich stage so each reasons about the SAME reading of a polysemous word.
const groundedSense = (grounding: WordGrounding | undefined): string =>
  grounding === undefined
    ? ''
    : `Grounded sense (do not contradict): ${grounding.coreDefinition} [${grounding.lexical.partOfSpeech}]\n`

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

// A named builder like the text prompts, so a reword shifts `provenance.promptHash`.
export const authorPortraitPrompt = (author: string): string => `Portrait of ${author}.`
