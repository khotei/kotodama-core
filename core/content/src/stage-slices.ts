import { enumWordJobStage, WordContentSchema, type WordJobStage } from '@lexiai/database'
import { type Schema, Struct } from 'effect'

/**
 * The single source of truth for what each pipeline stage produces — one struct per `wordJobStage`
 * whose keys ARE that stage's output slice (the disjoint subset of `words` content the stage owns).
 * Each slice is **`pick`ed off {@link WordContentSchema}** ({@link import('@lexiai/database')}), not
 * re-declared, so a field's schema (e.g. `frequency`'s nullability) has exactly one author in
 * `database/` and can't drift; this map authors only the *partition* (which keys per stage). The six
 * picks are disjoint and collectively cover every `WordContent` field. Both the **type**
 * ({@link StageSlice}) and the **runtime schema** (the real engine's `generateObject` argument) come
 * from here, so a stage's promise and its generation can't drift either. Each struct encodes to a
 * plain object, the shape `AiService.generateObject` requires.
 *
 * `satisfies Record<WordJobStage, Schema.Top>` makes the map **exhaustive at compile time** (a new
 * stage in `WORD_JOB_STAGES` fails `tsc` until its slice is added) while keeping each value's precise
 * struct type for indexing.
 *
 * @see `core/content/CLAUDE.md`
 */
export const STAGE_SLICES = {
  [enumWordJobStage.fetch_source]: WordContentSchema.mapFields(
    Struct.pick(['coreDefinition', 'lexical', 'pronunciation', 'sources']),
  ),
  [enumWordJobStage.enrich_etymology]: WordContentSchema.mapFields(Struct.pick(['etymology'])),
  [enumWordJobStage.enrich_tiers]: WordContentSchema.mapFields(
    Struct.pick(['tiers', 'relations', 'translations']),
  ),
  [enumWordJobStage.enrich_authors]: WordContentSchema.mapFields(
    Struct.pick(['authorExamples', 'culturalGuide']),
  ),
  [enumWordJobStage.enrich_visuals]: WordContentSchema.mapFields(Struct.pick(['visuals'])),
  [enumWordJobStage.final_review]: WordContentSchema.mapFields(Struct.pick(['frequency'])),
} satisfies Record<WordJobStage, Schema.Top>

/** The typed output slice of one stage — the precise content the stage's `produce` returns. */
export type StageSlice<S extends WordJobStage> = (typeof STAGE_SLICES)[S]['Type']

/**
 * The grounded sense `fetch_source` establishes, fed into every later stage so the whole entry stays
 * consistent with one reading of a polysemous word. A deliberately **curated** subset of the
 * `fetch_source` slice (not its full JSON) — the stability seam: `fetch_source`'s output may grow
 * without breaking downstream stages as long as this contract holds.
 */
export type WordGrounding = Pick<StageSlice<'fetch_source'>, 'coreDefinition' | 'lexical'>
