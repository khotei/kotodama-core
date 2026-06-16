import { Schema } from 'effect'
import { toEnum } from '../to-enum'

/**
 * The word content's closed value lists — each `as const` tuple is the single authored definition;
 * the literal schema, the named map, and the jsonb-nested union `$type` all derive from it. These
 * are jsonb-nested unions (no column backs them), so there is no `pgEnum` here.
 */

export const VISUAL_KINDS = ['hero', 'infographic', 'meme'] as const
export const VisualKind = Schema.Literals(VISUAL_KINDS)
export type VisualKind = typeof VisualKind.Type
export const enumVisualKind = toEnum(VISUAL_KINDS)

export const SOURCE_TYPES = [
  'wiktionary',
  'wikipedia',
  'dictionary',
  'primary',
  'scholarly',
] as const
export const SourceType = Schema.Literals(SOURCE_TYPES)
export type SourceType = typeof SourceType.Type
export const enumSourceType = toEnum(SOURCE_TYPES)

export const FREQUENCY_BANDS = ['rare', 'uncommon', 'common', 'frequent'] as const
export const FrequencyBand = Schema.Literals(FREQUENCY_BANDS)
export type FrequencyBand = typeof FrequencyBand.Type
export const enumFrequencyBand = toEnum(FREQUENCY_BANDS)
