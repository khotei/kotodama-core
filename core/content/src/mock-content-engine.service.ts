import {
  type BuildProvenanceEntity,
  enumJobErrorType,
  enumWordJobStage,
  type JobErrorType,
  type WordJobStage,
} from '@kotodama/core/database'
import { Duration, Effect, Layer } from 'effect'
import { ContentEngine, ContentEngineError } from './content-engine.service'
import { mockStageContent } from './mock-content'

/** Injecting a policy is how tests exercise the not_found / failed / slow paths precisely. */
export type StagePlan =
  | { readonly kind: 'produce'; readonly delayMillis?: number }
  | { readonly kind: 'fail'; readonly type: JobErrorType; readonly delayMillis?: number }

export type ContentPolicy = (word: string, stage: WordJobStage) => StagePlan

// Honest placeholders (never the real model/hash), so a mock-built row records that the mock made it.
const MOCK_PROVENANCE: BuildProvenanceEntity = {
  model: 'mock-content-engine',
  promptHash: 'mock',
  pipeline: 'mock-content-engine@0.1',
}

/** A per-stage delay that comfortably exceeds any sane per-stage timeout the worker sets. */
const SLOW_STAGE_DELAY_MILLIS = 30_000

/**
 * The reserved demo words that let the local loop hit each non-happy path without a custom policy:
 * `xyzzy` ⇒ not_found at the source fetch, `kaboom` ⇒ failure mid-pipeline, `molasses` ⇒ a slow
 * visuals pass. Every other word produces normally.
 */
export const defaultContentPolicy: ContentPolicy = (word, stage) => {
  switch (word.trim().toLowerCase()) {
    case 'xyzzy':
      return stage === enumWordJobStage.fetch_source
        ? { kind: 'fail', type: enumJobErrorType.not_found }
        : { kind: 'produce' }
    case 'kaboom':
      return stage === enumWordJobStage.enrich_visuals
        ? { kind: 'fail', type: enumJobErrorType.failed }
        : { kind: 'produce' }
    case 'molasses':
      return stage === enumWordJobStage.enrich_visuals
        ? { kind: 'produce', delayMillis: SLOW_STAGE_DELAY_MILLIS }
        : { kind: 'produce' }
    default:
      return { kind: 'produce' }
  }
}

const makeService = (policy: ContentPolicy) =>
  ContentEngine.of({
    produce: (stage, language, word) =>
      Effect.gen(function* () {
        const plan = policy(word, stage)
        if (plan.delayMillis !== undefined) yield* Effect.sleep(Duration.millis(plan.delayMillis))
        if (plan.kind === 'fail') {
          return yield* Effect.fail(
            new ContentEngineError({
              type: plan.type,
              message: `MockContentEngine: '${plan.type}' for "${word}" at stage '${stage}'`,
            }),
          )
        }
        return mockStageContent(stage, word, language)
      }),
    provenance: MOCK_PROVENANCE,
  })

/** A `ContentEngine` layer over an injectable {@link ContentPolicy} (defaults to {@link defaultContentPolicy}). */
export const makeMockContentEngine = (
  policy: ContentPolicy = defaultContentPolicy,
): Layer.Layer<ContentEngine> => Layer.succeed(ContentEngine, makeService(policy))

/** The default mock `ContentEngine` — produces realistic content, honoring the reserved demo words. */
export const MockContentEngine: Layer.Layer<ContentEngine> = makeMockContentEngine()
