import { createHash } from 'node:crypto'
import { type AiError, AiService } from '@lexiai/ai'
import {
  AuthorExample,
  CulturalGuide,
  enumVisualKind,
  enumWordJobStage,
  type Language,
  type SourceVersions,
  type StorageKey,
  Visual,
  type VisualKind,
  type Visuals,
  type WordJobStage,
} from '@lexiai/database'
import { WikiClient } from '@lexiai/external-apis'
import { authorKey, ImagesStore, imageKey, type StorageError } from '@lexiai/storage'
import { Effect, Layer, Option, Schema, Semaphore, Struct } from 'effect'
import { ContentEngine, ContentEngineError } from './content-engine.service'
import {
  IMAGE_CONCURRENCY,
  IMAGE_ROLES,
  type ImageRole,
  imageOptionsFor,
  NO_TEXT_DIRECTIVE,
  PROVENANCE_MODEL,
  PROVENANCE_STAGE_MODELS,
  TEXT_GEN,
  type TextGenConfig,
} from './generation-defaults'
import {
  authorPortraitPrompt,
  enrichAuthorsPrompt,
  enrichEtymologyPrompt,
  enrichTiersPrompt,
  enrichVisualsPrompt,
  fetchSourcePrompt,
  finalReviewPrompt,
  type WikiFacts,
} from './prompts'
import { STAGE_SLICES, type StageSlice, type WordGrounding } from './stage-slices'

/**
 * The model's `fetch_source` output. `isReal` is a **transient** not-found discriminant — the model
 * sets it when the word isn't real; it is read to decide `not_found` and then stripped, so it never
 * reaches the persisted slice (which carries only the authored slice keys — {@link STAGE_SLICES}).
 * Encodes to a plain object, the shape `AiService.generateObject` requires.
 */
const FetchSourceOutput = Schema.Struct({
  isReal: Schema.Boolean,
  ...STAGE_SLICES[enumWordJobStage.fetch_source].fields,
})

/**
 * The two media stages' **generation schemas** — what the model is asked to plan, which differs from the
 * stored slice by exactly the **render-filled keys**: `Visual.imageKey` / `AuthorExample.authorImageUrl`
 * are absent here (the model can't know an S3 key while planning; the render step adds them, so the
 * stored {@link Visuals}/{@link AuthorExample} require them). The leaf plans drop that one key from the
 * stored schema; the stage plans restate the (tiny, stable) slice partition — `tsc` flags any drift,
 * since each handler's return must still satisfy `StageSlice<S>` ({@link STAGE_SLICES}). The four text
 * stages have no such split — they generate their slice verbatim, straight off `STAGE_SLICES`.
 */
const VisualPlan = Visual.mapFields(Struct.omit(['imageKey']))
const AuthorExamplePlan = AuthorExample.mapFields(Struct.omit(['authorImageUrl']))

const EnrichVisualsPlan = Schema.Struct({
  visuals: Schema.Struct({
    hero: VisualPlan,
    infographic: VisualPlan,
    memes: Schema.Array(VisualPlan),
  }),
})

const EnrichAuthorsPlan = Schema.Struct({
  authorExamples: Schema.Array(AuthorExamplePlan),
  culturalGuide: CulturalGuide,
})

/**
 * Stable hash of **every prompt surface** the pipeline emits — `sourceVersions.promptHash` at promotion.
 * A sha256 over the six stage prompts plus the author-portrait prompt, the no-text directive, and the
 * image profile (`imageOptionsFor` per role — model/size/quality), all rendered for one **fixed** sample
 * `(en, "lacuna")` with **no grounding**. So the digest tracks the *template text + image config* — it
 * shifts whenever any of them changes — and is identical for every real word. Computed once at module
 * load; fed into {@link PROVENANCE}.
 */
const SOURCE_VERSIONS_PROMPT_HASH: string = createHash('sha256')
  .update(
    [
      fetchSourcePrompt('en', 'lacuna', undefined),
      enrichEtymologyPrompt('en', 'lacuna'),
      enrichTiersPrompt('en', 'lacuna'),
      enrichVisualsPrompt('en', 'lacuna'),
      enrichAuthorsPrompt('en', 'lacuna'),
      finalReviewPrompt('en', 'lacuna'),
      authorPortraitPrompt('lacuna'),
      NO_TEXT_DIRECTIVE,
      JSON.stringify(IMAGE_ROLES.map(imageOptionsFor)),
    ].join(' '),
  )
  .digest('hex')

/**
 * This engine's build provenance, read by the worker at promotion ({@link ContentEngine.sourceVersions})
 * and stamped onto `words.sourceVersions`. Build identity, not a content pass — so it is an engine
 * property, not a key smuggled through a slice.
 */
const PROVENANCE: SourceVersions = {
  model: PROVENANCE_MODEL,
  promptHash: SOURCE_VERSIONS_PROMPT_HASH,
  pipeline: 'real-content-engine@0.1',
  stageModels: PROVENANCE_STAGE_MODELS,
}

/**
 * Map an {@link AiError} to a `failed` {@link ContentEngineError}, copying its already-serializable
 * `message`/`cause` (the `cause` lands in the persisted `async_word_jobs.error` jsonb column). The text
 * analogue of {@link mediaFailure}: every text-stage `generateObject` failure maps through it, and
 * `mediaFailure` delegates its own `AiError` branch here, so the `AiError → failed` mapping has one author.
 */
const textFailure = (error: AiError): ContentEngineError =>
  new ContentEngineError({ type: 'failed', message: error.message, cause: error.cause })

/**
 * Map a media-stage failure to a `failed` {@link ContentEngineError}, keeping `cause` JSON-serializable
 * (it lands in the persisted `async_word_jobs.error` jsonb column). An {@link AiError} reuses
 * {@link textFailure}; a {@link StorageError}'s `cause` is a **live** S3 rejection, so it is dropped for a
 * `{ tag, key }` snapshot instead of being threaded through.
 */
const mediaFailure = (error: AiError | StorageError): ContentEngineError =>
  error._tag === 'AiError'
    ? textFailure(error)
    : new ContentEngineError({
        type: 'failed',
        message: `image write failed (${error.key})`,
        cause: { tag: 'StorageError', key: error.key },
      })

/**
 * The real `ContentEngine` over {@link AiService} + {@link WikiClient} + {@link ImagesStore}, all
 * captured at layer build. Every stage is implemented behind one typed {@link produce}: the text stages
 * (`fetch_source`, `enrich_etymology`, `enrich_tiers`, `final_review`) and the two media stages —
 * `enrich_visuals` (plan → render hero/infographic/memes) and `enrich_authors` (plan → render one
 * portrait per author) — which share the {@link renderToStorage} image→S3 seam. The text/media handlers
 * thread `fetch_source`'s {@link WordGrounding} into their prompts so the entry stays one consistent sense.
 *
 * Wall-clock timeouts are deliberately **not** handled here — `timed_out` is the worker's concern; this
 * engine maps only `not_found` and `failed`.
 *
 * @see `core/content/CLAUDE.md`
 */
export const RealContentEngineLive: Layer.Layer<
  ContentEngine,
  never,
  AiService | WikiClient | ImagesStore
> = Layer.effect(
  ContentEngine,
  Effect.gen(function* () {
    const ai = yield* AiService
    const wiki = yield* WikiClient
    const storage = yield* ImagesStore

    // One throttle shared across both media stages' fan-outs — caps total concurrent image renders so a
    // build's ~11 images don't burst past the gpt-image rate limit. See {@link IMAGE_CONCURRENCY}.
    const imageThrottle = Semaphore.makeUnsafe(IMAGE_CONCURRENCY)

    // Best-effort grounding: Wikipedia absence (Option.none) AND any WikiError both degrade to "no
    // grounding", so the source endpoint can never fail the stage (AC-5).
    const ground = (language: Language, word: string): Effect.Effect<Option.Option<WikiFacts>> =>
      wiki.summary(language, word).pipe(
        Effect.map(
          Option.map((summary) => ({
            extract: summary.extract,
            description: summary.description ?? undefined,
          })),
        ),
        Effect.catchTag('WikiError', () => Effect.succeedNone),
      )

    const fetchSource = (
      language: Language,
      word: string,
    ): Effect.Effect<StageSlice<'fetch_source'>, ContentEngineError> =>
      Effect.gen(function* () {
        const grounding = yield* ground(language, word)
        const prompt = fetchSourcePrompt(language, word, Option.getOrUndefined(grounding))

        const output = yield* ai
          .generateObject(FetchSourceOutput, prompt, TEXT_GEN.fetchSource)
          .pipe(Effect.mapError(textFailure))

        if (!output.isReal) {
          return yield* Effect.fail(
            new ContentEngineError({
              type: 'not_found',
              message: `"${word}" is not a real ${language} word`,
            }),
          )
        }

        const { isReal: _isReal, ...slice } = output
        return slice
      })

    // The plain text-enrichment stages (etymology, tiers, final_review) share one shape: no Wiki
    // grounding fetch, no transient discriminant — generate the typed slice and return it, mapping any
    // AiError to `failed`. `STAGE_SLICES[stage]`'s keys ARE the slice keys, so the decoded output *is*
    // the slice; `A` is inferred as that stage's `StageSlice`. `Record<string, unknown>` widens the
    // struct to the encode-to-object shape generateObject accepts.
    const textStage = <A>(
      schema: Schema.Codec<A, Record<string, unknown>>,
      config: TextGenConfig,
      prompt: string,
    ): Effect.Effect<A, ContentEngineError> =>
      ai.generateObject(schema, prompt, config).pipe(Effect.mapError(textFailure))

    /**
     * Render one image prompt and store the PNG under `key`, returning that key. The single
     * image→storage seam the media stages share — `enrich_visuals` (the {@link imageKey} scheme) and
     * `enrich_authors` (the {@link authorKey} scheme). The caller builds the key (the scheme stays in
     * `@lexiai/storage`) and names the image `kind`; the render request (model-by-role, size, quality)
     * comes from {@link imageOptionsFor}, the prompt gets the text-free directive, and the shared
     * {@link imageThrottle} paces it. So the model/quality decision lives solely in `generation-defaults.ts`.
     */
    const renderToStorage = (
      key: StorageKey,
      prompt: string,
      kind: ImageRole,
    ): Effect.Effect<StorageKey, AiError | StorageError> =>
      imageThrottle
        .withPermits(1)(ai.generateImage(prompt + NO_TEXT_DIRECTIVE, imageOptionsFor(kind)))
        .pipe(Effect.flatMap((bytes) => storage.put(key, bytes, { contentType: 'image/png' })))

    const enrichVisuals = (
      language: Language,
      word: string,
      grounding?: WordGrounding,
    ): Effect.Effect<StageSlice<'enrich_visuals'>, ContentEngineError> =>
      Effect.gen(function* () {
        const { visuals } = yield* ai.generateObject(
          EnrichVisualsPlan,
          enrichVisualsPrompt(language, word, grounding),
          TEXT_GEN.visuals,
        )

        const renderInto = (
          visual: typeof VisualPlan.Type,
          kind: VisualKind,
          index?: number,
        ): Effect.Effect<Visual, AiError | StorageError> =>
          renderToStorage(imageKey({ language, word, kind, index }), visual.prompt, kind).pipe(
            Effect.map((key) => ({ ...visual, imageKey: key })),
          )

        // Every image is independent — render hero, infographic and all memes concurrently. Done
        // sequentially each `gpt-image-2` call is ~1min, so a multi-image plan blew the per-stage
        // budget (the `enrich_visuals` timeout); in parallel the stage costs ~one image. hero and
        // infographic are always present (the plan requires both) — no null-skip branch.
        const [hero, infographic, memes] = yield* Effect.all(
          [
            renderInto(visuals.hero, enumVisualKind.hero),
            renderInto(visuals.infographic, enumVisualKind.infographic),
            Effect.forEach(
              visuals.memes,
              (meme, index) => renderInto(meme, enumVisualKind.meme, index),
              { concurrency: 'unbounded' },
            ),
          ],
          { concurrency: 'unbounded' },
        )

        return { visuals: { hero, infographic, memes } satisfies Visuals }
      }).pipe(Effect.mapError(mediaFailure))

    // This stage owns BOTH the author text AND the portraits: `authorImageUrl` lives in the
    // `authorExamples` slice, so the image→S3 path runs here to keep stage→slice keys disjoint (G5).
    // The text step plans authors (`authorImageUrl: null`); the portrait step renders one image per
    // author under the `authorKey` scheme and fills each key.
    const enrichAuthors = (
      language: Language,
      word: string,
      grounding?: WordGrounding,
    ): Effect.Effect<StageSlice<'enrich_authors'>, ContentEngineError> =>
      Effect.gen(function* () {
        const { authorExamples, culturalGuide } = yield* ai.generateObject(
          EnrichAuthorsPlan,
          enrichAuthorsPrompt(language, word, grounding),
          TEXT_GEN.authors,
        )

        // One portrait per author, rendered concurrently — independent `gpt-image-2` calls, same
        // reason as enrich_visuals (sequential image renders overrun the per-stage budget).
        const withPortraits = yield* Effect.forEach(
          authorExamples,
          (author, index) =>
            // 'author' is a non-hero role, so it renders on the secondary image model (generation-defaults).
            renderToStorage(
              authorKey({ language, word, index }),
              authorPortraitPrompt(author.author),
              'author',
            ).pipe(Effect.map((authorImageUrl) => ({ ...author, authorImageUrl }))),
          { concurrency: 'unbounded' },
        )

        return { authorExamples: withPortraits, culturalGuide }
      }).pipe(Effect.mapError(mediaFailure))

    // One handler per stage, keyed by `wordJobStage` — the mapped type makes the record exhaustive
    // (a new stage fails `tsc` here) and each entry is checked to return its own `StageSlice`. `produce`
    // is the generic façade: it dispatches on `stage` without a `switch`, so the per-stage type survives.
    const handlers: {
      readonly [S in WordJobStage]: (
        language: Language,
        word: string,
        grounding?: WordGrounding,
      ) => Effect.Effect<StageSlice<S>, ContentEngineError>
    } = {
      [enumWordJobStage.fetch_source]: (language, word) => fetchSource(language, word),
      [enumWordJobStage.enrich_etymology]: (language, word, grounding) =>
        textStage(
          STAGE_SLICES[enumWordJobStage.enrich_etymology],
          TEXT_GEN.etymology,
          enrichEtymologyPrompt(language, word, grounding),
        ),
      [enumWordJobStage.enrich_tiers]: (language, word, grounding) =>
        textStage(
          STAGE_SLICES[enumWordJobStage.enrich_tiers],
          TEXT_GEN.tiers,
          enrichTiersPrompt(language, word, grounding),
        ),
      [enumWordJobStage.enrich_authors]: (language, word, grounding) =>
        enrichAuthors(language, word, grounding),
      [enumWordJobStage.enrich_visuals]: (language, word, grounding) =>
        enrichVisuals(language, word, grounding),
      [enumWordJobStage.final_review]: (language, word, grounding) =>
        textStage(
          STAGE_SLICES[enumWordJobStage.final_review],
          TEXT_GEN.finalReview,
          finalReviewPrompt(language, word, grounding),
        ),
    }

    const produce = <S extends WordJobStage>(
      stage: S,
      language: Language,
      word: string,
      grounding?: WordGrounding,
    ): Effect.Effect<StageSlice<S>, ContentEngineError> =>
      handlers[stage](language, word, grounding)

    return ContentEngine.of({ produce, sourceVersions: PROVENANCE })
  }),
)
