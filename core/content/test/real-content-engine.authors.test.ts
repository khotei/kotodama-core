import { describe, expect, it } from '@effect/vitest'
import { AuthorExampleEntity, CulturalGuideEntity, enumLanguage } from '@kotodama/database'
import { AiError, AiService } from '@kotodama/platform/ai'
import { WikiClientTest } from '@kotodama/platform/external-apis/testing'
import {
  bucketObjects,
  resetBucket,
  StorageLocalStackLive,
} from '@kotodama/platform/storage/testing'
import { Effect, Layer, Schema } from 'effect'
import { ContentEngine, ContentEngineError } from '../src'
import { RealContentEngineLive } from '../src/real-content-engine.service'

/**
 * The `enrich_authors` text plan the AI step returns — `{ authorExamples, culturalGuide }` with
 * `authorImageUrl: null` on every author; the portrait step fills the keys in. Mirrors the engine's
 * `AuthorsPlanStruct`.
 */
const authorsPlanObject = (word: string) => ({
  authorExamples: [
    {
      author: 'A. Writer',
      authorImageUrl: null,
      work: `On ${word}`,
      language: enumLanguage.en,
      isGenerated: false,
      quote: `Consider the ${word}.`,
    },
    {
      author: 'B. Poet',
      authorImageUrl: null,
      language: enumLanguage.en,
      isGenerated: true,
      quote: `O ${word}, you linger.`,
    },
  ],
  culturalGuide: {
    timeline: [{ date: '1900', text: `“${word}” enters use.` }],
    forecast2030: `“${word}” holds steady.`,
    notes: [`A note on ${word}.`],
  },
})

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

/**
 * A bespoke {@link AiService} fake — `generateObject` returns the authors plan and `generateImage`
 * returns image bytes (or fails when `image` is undefined), so the text and portrait steps see
 * different values.
 */
const aiTest = (object: unknown, image: Uint8Array | undefined): Layer.Layer<AiService> =>
  Layer.succeed(
    AiService,
    AiService.of({
      generateObject: (_schema, _prompt, _opts) => Effect.succeed(object as never),
      generateImage: (_prompt, _opts) =>
        image === undefined
          ? Effect.fail(AiError.fromCause('generateImage', new Error('no image')))
          : Effect.succeed(image),
    }),
  )

// The engine over canned AI; `ImagesStore` is left on the requirements channel — the outer
// `it.layer(StorageLocalStackLive)` provides the real S3-backed storage shared across the file.
const engineLayer = (object: unknown, image: Uint8Array | undefined) =>
  RealContentEngineLive.pipe(
    Layer.provide(aiTest(object, image)),
    Layer.provide(WikiClientTest({ summaries: {} })),
  )

const AuthorsResult = Schema.Struct({
  authorExamples: Schema.Array(AuthorExampleEntity),
  culturalGuide: CulturalGuideEntity,
})

it.layer(StorageLocalStackLive, { timeout: '120 seconds' })((it) => {
  describe('RealContentEngine.produce — enrich_authors', () => {
    it.effect('renders a portrait per author and returns the slice (AC)', () =>
      Effect.gen(function* () {
        yield* resetBucket
        const engine = yield* ContentEngine
        const result = yield* engine.produce('enrich_authors', enumLanguage.en, 'lacuna')

        expect(new Set(Object.keys(result))).toEqual(new Set(['authorExamples', 'culturalGuide']))
        const { authorExamples, culturalGuide } = Schema.decodeUnknownSync(AuthorsResult)(result)

        // The engine threads each `put` key back into the slice — one authorKey(...) per author, in
        // author order (this comes from the result, not S3, so order is asserted here).
        expect(authorExamples.map((a) => a.authorImageUrl)).toEqual([
          'authors/en/lacuna/0.png',
          'authors/en/lacuna/1.png',
        ])
        expect(culturalGuide.forecast2030).toBe('“lacuna” holds steady.')

        // One PNG object per author landed in the bucket. S3 LIST is unordered, so assert the key set.
        const objects = yield* bucketObjects
        expect(new Set(objects.map((o) => o.key))).toEqual(
          new Set(['authors/en/lacuna/0.png', 'authors/en/lacuna/1.png']),
        )
        for (const object of objects) {
          expect(object.bytes).toEqual(PNG_BYTES)
          expect(object.contentType).toBe('image/png')
        }
      }).pipe(Effect.provide(engineLayer(authorsPlanObject('lacuna'), PNG_BYTES))),
    )

    it.effect('fails failed when image generation errors', () =>
      Effect.gen(function* () {
        const engine = yield* ContentEngine
        const error = yield* engine
          .produce('enrich_authors', enumLanguage.en, 'lacuna')
          .pipe(Effect.flip)
        expect(error).toBeInstanceOf(ContentEngineError)
        expect(error.type).toBe('failed')
      }).pipe(Effect.provide(engineLayer(authorsPlanObject('lacuna'), undefined))),
    )
  })
})
