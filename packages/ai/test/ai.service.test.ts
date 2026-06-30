import { OpenAiClient } from '@effect/ai-openai/OpenAiClient'
import { OpenAiClientGenerated } from '@effect/ai-openai/OpenAiClientGenerated'
import { describe, expect, it } from '@effect/vitest'
import { Effect, Encoding, Layer, Schema } from 'effect'
import { AiError, AiService, AiServiceLive } from '../src/ai.service'
import { AiServiceTest } from '../src/testing'

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const PNG_B64 = Encoding.encodeBase64(PNG_BYTES)

type GeneratedService = (typeof OpenAiClientGenerated)['Service']

/**
 * A fake generated client exposing only `createImage`; every other method is absent and
 * would throw if a test reached it — `generateImage` is the only path under test here.
 */
const fakeGeneratedClient = (createImage: GeneratedService['createImage']): GeneratedService =>
  ({ createImage }) as GeneratedService

// `generateImage` never touches the handwritten client; an empty stub satisfies its capture at build.
const fakeOpenAiClient = Layer.succeed(OpenAiClient, {} as (typeof OpenAiClient)['Service'])

const IMAGE_OPTS = { model: 'gpt-image-1.5', size: '1024x1024', quality: 'low' } as const

const imageLayer = (createImage: GeneratedService['createImage']) =>
  AiServiceLive.pipe(
    Layer.provide(Layer.succeed(OpenAiClientGenerated, fakeGeneratedClient(createImage))),
    Layer.provide(fakeOpenAiClient),
  )

describe('AiService (real, fake OpenAiClientGenerated)', () => {
  it.effect('generateImage decodes b64_json into the right bytes', () =>
    Effect.gen(function* () {
      const ai = yield* AiService
      const bytes = yield* ai.generateImage('a cat', IMAGE_OPTS)
      expect(Array.from(bytes)).toEqual(Array.from(PNG_BYTES))
    }).pipe(
      Effect.provide(
        imageLayer(() => Effect.succeed({ created: 0, data: [{ b64_json: PNG_B64 }] }) as never),
      ),
    ),
  )

  it.effect('generateImage maps a client failure to AiError with a serializable cause', () =>
    Effect.gen(function* () {
      const ai = yield* AiService
      const error = yield* ai.generateImage('a cat', IMAGE_OPTS).pipe(Effect.flip)
      expect(error).toBeInstanceOf(AiError)
      expect(error._tag).toBe('AiError')
      // `message` is a non-empty reason drilled from the provider error.
      expect(error.message).toContain('boom')
      // `cause` is a plain serializable snapshot — it round-trips and holds no live Error instance.
      expect(error.cause).not.toBeInstanceOf(Error)
      expect(JSON.parse(JSON.stringify(error.cause))).toEqual(error.cause)
    }).pipe(Effect.provide(imageLayer(() => Effect.fail(new Error('boom')) as never))),
  )

  it.effect('generateImage fails with AiError when the response carries no image bytes', () =>
    Effect.gen(function* () {
      const ai = yield* AiService
      const error = yield* ai.generateImage('a cat', IMAGE_OPTS).pipe(Effect.flip)
      expect(error).toBeInstanceOf(AiError)
      expect(error.message.length).toBeGreaterThan(0)
      expect(JSON.parse(JSON.stringify(error.cause))).toEqual(error.cause)
    }).pipe(Effect.provide(imageLayer(() => Effect.succeed({ created: 0, data: [] }) as never))),
  )
})

const Person = Schema.Struct({ name: Schema.String, age: Schema.Number })

describe('AiServiceTest (fixtures)', () => {
  it.effect('generateObject yields the canned decoded object', () =>
    Effect.gen(function* () {
      const ai = yield* AiService
      const value = yield* ai.generateObject(Person, 'make a person', {
        model: 'gpt-5',
        reasoningEffort: 'low',
      })
      expect(value).toEqual({ name: 'Ada', age: 36 })
    }).pipe(Effect.provide(AiServiceTest({ object: { name: 'Ada', age: 36 } }))),
  )

  it.effect('generateImage returns the canned bytes', () =>
    Effect.gen(function* () {
      const ai = yield* AiService
      const bytes = yield* ai.generateImage('a cat', IMAGE_OPTS)
      expect(Array.from(bytes)).toEqual(Array.from(PNG_BYTES))
    }).pipe(Effect.provide(AiServiceTest({ image: PNG_BYTES }))),
  )
})
