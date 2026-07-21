import { WordEntity } from '@kotodama/database'
import { Struct } from 'effect'

/**
 * The word's generated content — an explicit **allowlist** (`pick`) of the fields the pipeline
 * produces, each still keyed off {@link WordEntity} so its schema has one author. Allowlist, not
 * `omit`: this shape IS the LLM `generateObject` surface, so it must fail *closed* — a new
 * envelope/storage column (as `stages` was) never leaks into what the model is asked to generate;
 * adding a real content field is the deliberate act of listing it here (and in `STAGE_SLICES`).
 */
export const WordContent = WordEntity.mapFields(
  Struct.pick([
    'coreDefinition',
    'lexical',
    'pronunciation',
    'tiers',
    'etymology',
    'authorExamples',
    'culturalGuide',
    'relations',
    'translations',
    'visuals',
    'sources',
    'frequency',
  ]),
)
export type WordContent = typeof WordContent.Type
