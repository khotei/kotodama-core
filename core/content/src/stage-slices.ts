import { enumWordJobStage, type WordJobStage } from '@kotodama/core/database'
import { type Schema, Struct } from 'effect'
import { WordContent } from './word-content.schema'

/**
 * The single source of stage → output shape. Each slice is `pick`ed off {@link WordContent} — never
 * re-declared — so a field's schema has one author in `database/`; this map authors only the
 * *partition*. The six picks are disjoint and collectively cover every `WordContent` field. Both
 * the type contract ({@link StageSlice}) and the engine's `generateObject` runtime schema come from
 * here, so a stage's promise and its generation can't drift. The `satisfies` keeps the map
 * exhaustive at compile time while preserving each value's precise struct type for indexing.
 */
export const STAGE_SLICES = {
  [enumWordJobStage.fetch_source]: WordContent.mapFields(
    Struct.pick(['coreDefinition', 'lexical', 'pronunciation', 'sources']),
  ),
  [enumWordJobStage.enrich_etymology]: WordContent.mapFields(Struct.pick(['etymology'])),
  [enumWordJobStage.enrich_tiers]: WordContent.mapFields(
    Struct.pick(['tiers', 'relations', 'translations']),
  ),
  [enumWordJobStage.enrich_authors]: WordContent.mapFields(
    Struct.pick(['authorExamples', 'culturalGuide']),
  ),
  [enumWordJobStage.enrich_visuals]: WordContent.mapFields(Struct.pick(['visuals'])),
  [enumWordJobStage.final_review]: WordContent.mapFields(Struct.pick(['frequency'])),
} satisfies Record<WordJobStage, Schema.Top>

export type StageSlice<S extends WordJobStage> = (typeof STAGE_SLICES)[S]['Type']

/**
 * The grounded sense fed into every later stage (one consistent reading of a polysemous word). A
 * deliberately curated subset — the stability seam: `fetch_source`'s output may grow without
 * breaking downstream stages as long as this contract holds.
 */
export type WordGrounding = Pick<StageSlice<'fetch_source'>, 'coreDefinition' | 'lexical'>
