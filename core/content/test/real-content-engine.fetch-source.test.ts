import { describe, expect, it } from '@effect/vitest'
import {
  enumLanguage,
  LexicalEntity,
  PronunciationEntity,
  SourceEntity,
} from '@kotodama/core/database'
import { AiServiceTest } from '@kotodama/platform/ai/testing'
import type { WikiSummary } from '@kotodama/platform/external-apis'
import { WikiClientTest } from '@kotodama/platform/external-apis/testing'
import { UnusedStorage } from '@kotodama/platform/storage/testing'
import { Effect, Layer, Schema } from 'effect'
import { ContentEngine, ContentEngineError } from '../src'
import { RealContentEngineLive } from '../src/real-content-engine.service'

/**
 * The authored `fetch_source` slice, rebuilt here from the same content schemas the engine decodes
 * through. The engine's `StageResultEntity` must validate against this — and must NOT carry `isReal`.
 */
const FetchSourceSlice = Schema.Struct({
  coreDefinition: Schema.String,
  lexical: LexicalEntity,
  pronunciation: PronunciationEntity,
  sources: Schema.Array(SourceEntity),
})
const decodeSlice = Schema.decodeUnknownSync(FetchSourceSlice)

/** A canned fetch_source object shaped like `FetchSourceOutput` (with the transient `isReal`). */
const realObject = (word: string) => ({
  isReal: true,
  coreDefinition: `${word}: a real definition.`,
  lexical: { partOfSpeech: 'noun', register: ['formal'] },
  pronunciation: {
    ipa: `/${word}/`,
    respelling: word.toUpperCase(),
    audio: { uk: null, us: null },
  },
  sources: [{ index: 0, type: 'wikipedia', title: `Wikipedia: ${word}` }],
})

const standardSummary: WikiSummary = {
  type: 'standard',
  title: 'Lacuna',
  extract: 'A lacuna is an unfilled space or gap.',
}

/** Engine over canned AI output + a Wiki fixture map. */
const engineLayer = (
  object: unknown,
  summaries: Record<string, WikiSummary> = {},
): Layer.Layer<ContentEngine> =>
  RealContentEngineLive.pipe(
    Layer.provide(AiServiceTest({ object })),
    Layer.provide(WikiClientTest({ summaries })),
    Layer.provide(UnusedStorage),
  )

describe('RealContentEngine.produce — fetch_source', () => {
  it.effect(
    'returns a StageResultEntity that decodes through the fetch_source slice, without isReal',
    () =>
      Effect.gen(function* () {
        const engine = yield* ContentEngine
        const result = yield* engine.produce('fetch_source', enumLanguage.en, 'lacuna')

        expect(result).not.toHaveProperty('isReal')
        expect(new Set(Object.keys(result))).toEqual(
          new Set(['coreDefinition', 'lexical', 'pronunciation', 'sources']),
        )
        const decoded = decodeSlice(result)
        expect(decoded.coreDefinition).toContain('lacuna')
      }).pipe(Effect.provide(engineLayer(realObject('lacuna'), { lacuna: standardSummary }))),
  )

  it.effect('still succeeds when Wikipedia has no grounding (AC-5)', () =>
    Effect.gen(function* () {
      const engine = yield* ContentEngine
      const result = yield* engine.produce('fetch_source', enumLanguage.en, 'lacuna')
      expect(result).toHaveProperty('coreDefinition')
    }).pipe(Effect.provide(engineLayer(realObject('lacuna')))),
  )

  it.effect('fails not_found when the model judges the word unreal (AC-6)', () =>
    Effect.gen(function* () {
      const engine = yield* ContentEngine
      const error = yield* engine
        .produce('fetch_source', enumLanguage.en, 'xyzzy')
        .pipe(Effect.flip)
      expect(error).toBeInstanceOf(ContentEngineError)
      expect(error.type).toBe('not_found')
    }).pipe(Effect.provide(engineLayer({ ...realObject('xyzzy'), isReal: false }))),
  )

  it.effect('fails failed when generation errors / decode fails (AC-6)', () =>
    Effect.gen(function* () {
      const engine = yield* ContentEngine
      const error = yield* engine
        .produce('fetch_source', enumLanguage.en, 'lacuna')
        .pipe(Effect.flip)
      expect(error).toBeInstanceOf(ContentEngineError)
      expect(error.type).toBe('failed')
    }).pipe(Effect.provide(engineLayer(undefined))),
  )
})
