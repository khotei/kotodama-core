import { createHash } from 'node:crypto'
import { type AiError, AiService } from '@lexiai/ai'
import {
  AuthorExampleEntity,
  CulturalGuideEntity,
  enumVisualKind,
  enumWordJobStage,
  type Language,
  type SourceVersionsEntity,
  type StorageKey,
  VisualEntity,
  type VisualKind,
  type VisualsEntity,
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

// `isReal` is a transient not-found discriminant — read to decide `not_found`, then stripped, so
// it never reaches the persisted slice.
const FetchSourceOutput = Schema.Struct({
  isReal: Schema.Boolean,
  ...STAGE_SLICES[enumWordJobStage.fetch_source].fields,
})

// The media *plans* differ from the stored slices by exactly the render-filled keys (`imageKey`,
// `authorImageUrl`) — the model can't know an S3 key while planning; the render step fills them.
// Each handler's return must still satisfy `StageSlice<S>`, so `tsc` flags any drift.
const VisualPlan = VisualEntity.mapFields(Struct.omit(['imageKey']))
const AuthorExamplePlan = AuthorExampleEntity.mapFields(Struct.omit(['authorImageUrl']))

const EnrichVisualsPlan = Schema.Struct({
  visuals: Schema.Struct({
    hero: VisualPlan,
    infographic: VisualPlan,
    memes: Schema.Array(VisualPlan),
  }),
})

const EnrichAuthorsPlan = Schema.Struct({
  authorExamples: Schema.Array(AuthorExamplePlan),
  culturalGuide: CulturalGuideEntity,
})

// sha256 over every prompt template + the image config, rendered for one fixed sample with no
// grounding — so the digest tracks the recipe, not the word, and is identical across all words.
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

// Build identity, not a content pass — an engine property, never a key smuggled through a slice.
const PROVENANCE: SourceVersionsEntity = {
  model: PROVENANCE_MODEL,
  promptHash: SOURCE_VERSIONS_PROMPT_HASH,
  pipeline: 'real-content-engine@0.1',
  stageModels: PROVENANCE_STAGE_MODELS,
}

const textFailure = (error: AiError): ContentEngineError =>
  new ContentEngineError({ type: 'failed', message: error.message, cause: error.cause })

// Keeps `cause` JSON-serializable for the `async_word_jobs.error` jsonb column: an AiError's cause
// is already a snapshot, but a StorageError's is a LIVE S3 rejection — dropped for `{ tag, key }`.
const mediaFailure = (error: AiError | StorageError): ContentEngineError =>
  error._tag === 'AiError'
    ? textFailure(error)
    : new ContentEngineError({
        type: 'failed',
        message: `image write failed (${error.key})`,
        cause: { tag: 'StorageError', key: error.key },
      })

/**
 * The real `ContentEngine` over `AiService` + `WikiClient` + `ImagesStore`. Wall-clock timeouts
 * are deliberately NOT handled here — `timed_out` is the worker's concern; this engine maps only
 * `not_found` and `failed`.
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

    // One throttle across BOTH media stages' fan-outs — see IMAGE_CONCURRENCY.
    const imageThrottle = Semaphore.makeUnsafe(IMAGE_CONCURRENCY)

    // Best-effort: Wikipedia absence AND any WikiError both degrade to "no grounding" — the
    // source endpoint can never fail the stage.
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

    // `Record<string, unknown>` widens the struct to the encode-to-object shape generateObject
    // accepts; the decoded output IS the stage's slice.
    const textStage = <A>(
      schema: Schema.Codec<A, Record<string, unknown>>,
      config: TextGenConfig,
      prompt: string,
    ): Effect.Effect<A, ContentEngineError> =>
      ai.generateObject(schema, prompt, config).pipe(Effect.mapError(textFailure))

    // The one image→storage seam both media stages share. The CALLER builds the key, so the path
    // scheme stays solely in @lexiai/storage; the model/size/quality decision stays in
    // generation-defaults.
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
        ): Effect.Effect<VisualEntity, AiError | StorageError> =>
          renderToStorage(imageKey({ language, word, kind, index }), visual.prompt, kind).pipe(
            Effect.map((key) => ({ ...visual, imageKey: key })),
          )

        // Concurrent renders: sequentially, each image call is ~1min and a multi-image plan blew
        // the per-stage budget; in parallel the stage costs ~one image.
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

        return { visuals: { hero, infographic, memes } satisfies VisualsEntity }
      }).pipe(Effect.mapError(mediaFailure))

    // Owns BOTH the author text AND the portraits: `authorImageUrl` lives in the `authorExamples`
    // slice, so the image→S3 path runs in this stage to keep stage→slice keys disjoint.
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

        const withPortraits = yield* Effect.forEach(
          authorExamples,
          (author, index) =>
            renderToStorage(
              authorKey({ language, word, index }),
              authorPortraitPrompt(author.author),
              'author',
            ).pipe(Effect.map((authorImageUrl) => ({ ...author, authorImageUrl }))),
          { concurrency: 'unbounded' },
        )

        return { authorExamples: withPortraits, culturalGuide }
      }).pipe(Effect.mapError(mediaFailure))

    // Exhaustive by construction (a new stage fails tsc here); dispatch through a record, not a
    // `switch`, so the per-stage generic type survives.
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
