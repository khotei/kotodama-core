import { describe, expect, it } from '@effect/vitest'
import { enumLanguage, enumVisualKind, VisualsEntity } from '@kotodama/database'
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
 * The `enrich_visuals` plan the AI step returns — a `{ visuals }` object with `imageKey: null` on
 * every visual; the image step fills the keys in. Mirrors the engine's `VisualsPlanStruct`.
 */
const visualsPlanObject = (word: string) => ({
  visuals: {
    hero: {
      kind: enumVisualKind.hero,
      imageKey: null,
      prompt: `A hero image for “${word}”.`,
      concept: `${word} as a hero scene`,
      caption: `Hero: ${word}`,
    },
    infographic: {
      kind: enumVisualKind.infographic,
      imageKey: null,
      prompt: `An infographic for “${word}”.`,
      concept: `${word} broken down`,
    },
    memes: [
      {
        kind: enumVisualKind.meme,
        imageKey: null,
        prompt: `A meme #0 for “${word}”.`,
        concept: `${word} meme #0`,
      },
      {
        kind: enumVisualKind.meme,
        imageKey: null,
        prompt: `A meme #1 for “${word}”.`,
        concept: `${word} meme #1`,
      },
    ],
  },
})

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

/**
 * A bespoke {@link AiService} fake — `AiServiceTest` returns one canned `object`, but this stage needs
 * `generateObject` (the plan) AND `generateImage` (the bytes) to return *different* values, so the
 * test layer wires both independently.
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

it.layer(StorageLocalStackLive, { timeout: '120 seconds' })((it) => {
  describe('RealContentEngine.produce — enrich_visuals', () => {
    it.effect('renders hero, infographic, and each meme to storage (AC)', () =>
      Effect.gen(function* () {
        yield* resetBucket
        const engine = yield* ContentEngine
        const result = yield* engine.produce('enrich_visuals', enumLanguage.en, 'lacuna')

        expect(new Set(Object.keys(result))).toEqual(new Set(['visuals']))
        const { visuals } = Schema.decodeUnknownSync(Schema.Struct({ visuals: VisualsEntity }))(
          result,
        )

        // The engine threads each `put` key (imageKey(...)) back into the slice — asserted from the
        // result, so render order holds here.
        expect(visuals.hero?.imageKey).toBe('visuals/en/lacuna/hero.png')
        expect(visuals.infographic?.imageKey).toBe('visuals/en/lacuna/infographic.png')
        expect(visuals.memes.map((m) => m.imageKey)).toEqual([
          'visuals/en/lacuna/meme-0.png',
          'visuals/en/lacuna/meme-1.png',
        ])

        // One PNG object per visual landed in the bucket. S3 LIST is unordered — assert the key set.
        const objects = yield* bucketObjects
        expect(new Set(objects.map((o) => o.key))).toEqual(
          new Set([
            'visuals/en/lacuna/hero.png',
            'visuals/en/lacuna/infographic.png',
            'visuals/en/lacuna/meme-0.png',
            'visuals/en/lacuna/meme-1.png',
          ]),
        )
        for (const object of objects) {
          expect(object.bytes).toEqual(PNG_BYTES)
          expect(object.contentType).toBe('image/png')
        }
      }).pipe(Effect.provide(engineLayer(visualsPlanObject('lacuna'), PNG_BYTES))),
    )

    it.effect('fails failed when image generation errors', () =>
      Effect.gen(function* () {
        const engine = yield* ContentEngine
        const error = yield* engine
          .produce('enrich_visuals', enumLanguage.en, 'lacuna')
          .pipe(Effect.flip)
        expect(error).toBeInstanceOf(ContentEngineError)
        expect(error.type).toBe('failed')
      }).pipe(Effect.provide(engineLayer(visualsPlanObject('lacuna'), undefined))),
    )
  })
})
