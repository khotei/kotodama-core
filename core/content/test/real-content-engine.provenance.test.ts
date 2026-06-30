import { createHash } from 'node:crypto'
import { describe, expect, it } from '@effect/vitest'
import { AiServiceTest } from '@lexiai/ai/testing'
import { WikiClientTest } from '@lexiai/external-apis/testing'
import { UnusedStorage } from '@lexiai/storage/testing'
import { Effect, Layer } from 'effect'
import { ContentEngine } from '../src'
import { IMAGE_ROLES, imageOptionsFor, NO_TEXT_DIRECTIVE } from '../src/generation-defaults'
import {
  authorPortraitPrompt,
  enrichAuthorsPrompt,
  enrichEtymologyPrompt,
  enrichTiersPrompt,
  enrichVisualsPrompt,
  fetchSourcePrompt,
  finalReviewPrompt,
} from '../src/prompts'
import { RealContentEngineLive } from '../src/real-content-engine.service'

// No stage is produced here — `sourceVersions` is a static engine property — so the three leaves are
// provided only to satisfy the layer's requirements; their fixtures are never exercised.
const engineLayer: Layer.Layer<ContentEngine> = RealContentEngineLive.pipe(
  Layer.provide(AiServiceTest({})),
  Layer.provide(WikiClientTest({ summaries: {} })),
  Layer.provide(UnusedStorage),
)

// An independent recomputation of the promptHash over EVERY surface the pipeline emits. If the engine
// drops one from its digest (the bug this guards), the impl hash stops matching this and the test fails.
const portrait = authorPortraitPrompt('lacuna')
const allSurfaces = [
  fetchSourcePrompt('en', 'lacuna', undefined),
  enrichEtymologyPrompt('en', 'lacuna'),
  enrichTiersPrompt('en', 'lacuna'),
  enrichVisualsPrompt('en', 'lacuna'),
  enrichAuthorsPrompt('en', 'lacuna'),
  finalReviewPrompt('en', 'lacuna'),
  portrait,
  NO_TEXT_DIRECTIVE,
  JSON.stringify(IMAGE_ROLES.map(imageOptionsFor)),
]
const hashOf = (parts: readonly string[]): string =>
  createHash('sha256').update(parts.join(' ')).digest('hex')

describe('RealContentEngine.sourceVersions — build provenance', () => {
  it.effect('exposes the model + pipeline identity the worker stamps onto the words row', () =>
    Effect.gen(function* () {
      const engine = yield* ContentEngine
      expect(engine.sourceVersions.model).toBe('gpt-5.5')
      expect(engine.sourceVersions.pipeline).toBe('real-content-engine@0.1')
    }).pipe(Effect.provide(engineLayer)),
  )

  it.effect('stamps every per-stage text + image model into stageModels (AC-7)', () =>
    Effect.gen(function* () {
      const engine = yield* ContentEngine
      expect(engine.sourceVersions.stageModels).toEqual({
        fetch_source: 'gpt-5.4-mini',
        enrich_etymology: 'gpt-5.4',
        enrich_tiers: 'gpt-5.5',
        enrich_authors: 'gpt-5.5',
        enrich_visuals: 'gpt-5.4',
        final_review: 'gpt-5.4',
        hero_image: 'gpt-image-2',
        secondary_image: 'gpt-image-1.5',
      })
    }).pipe(Effect.provide(engineLayer)),
  )

  it.effect('promptHash digests every prompt surface + the image profile (AC-6)', () =>
    Effect.gen(function* () {
      const engine = yield* ContentEngine
      // The impl's digest equals a recomputation over all surfaces — dropping any surface fails here.
      expect(engine.sourceVersions.promptHash).toBe(hashOf(allSurfaces))
      // And the portrait genuinely contributes: omitting it changes the digest.
      expect(hashOf(allSurfaces.filter((s) => s !== portrait))).not.toBe(
        engine.sourceVersions.promptHash,
      )
    }).pipe(Effect.provide(engineLayer)),
  )
})
