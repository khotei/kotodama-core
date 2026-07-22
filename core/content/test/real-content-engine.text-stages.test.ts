import { describe, expect, it } from '@effect/vitest'
import {
  EtymologyEntity,
  enumFrequencyBand,
  enumLanguage,
  FrequencyEntity,
  RelationsEntity,
  TiersEntity,
  TranslationEntity,
} from '@kotodama/core/database'
import { AiServiceTest } from '@kotodama/platform/ai/testing'
import { WikiClientTest } from '@kotodama/platform/external-apis/testing'
import { UnusedStorage } from '@kotodama/platform/storage/testing'
import { Effect, Layer, Schema } from 'effect'
import { ContentEngine, ContentEngineError } from '../src'
import { RealContentEngineLive } from '../src/real-content-engine.service'

/**
 * The three text-enrichment slices, rebuilt from the same content schemas the engine decodes
 * through — each stage's `StageResultEntity` must validate against the slice keyed exactly to it.
 */
const EtymologySlice = Schema.Struct({ etymology: EtymologyEntity })
const TiersSlice = Schema.Struct({
  tiers: TiersEntity,
  relations: RelationsEntity,
  translations: Schema.Array(TranslationEntity),
})
const FrequencySlice = Schema.Struct({ frequency: FrequencyEntity })

/** A canned `enrich_etymology` object, shaped like the engine's etymology struct. */
const etymologyObject = (word: string) => ({
  etymology: {
    summary: `“${word}” has an attested descent.`,
    firstAttested: { year: 1500, language: 'Latin' },
    origin: { from: `${word}-`, to: word, gloss: `relating to ${word}` },
    descent: [{ when: '1500', form: `${word}us`, languageName: 'Latin', gloss: `root of ${word}` }],
  },
})

/** A canned `enrich_tiers` object, shaped like the engine's tiers/relations/translations struct. */
const tiersObject = (word: string) => ({
  tiers: {
    quick: { title: 'Quick', body: `quick ${word}`, examples: [] },
    everyday: { title: 'Everyday', body: `everyday ${word}`, examples: [] },
    deep: { title: 'Deep', body: `deep ${word}`, examples: [] },
    cultural: { title: 'Cultural', body: `cultural ${word}`, examples: [] },
  },
  relations: { synonyms: [{ term: `${word}-like` }], antonyms: [], family: [] },
  translations: [{ language: 'fr', term: `${word} (fr)` }],
})

/** A canned `final_review` object, shaped like the engine's frequency struct. */
const frequencyObject = () => ({
  frequency: { band: enumFrequencyBand.uncommon, trendNote: 'steady use', series: [] },
})

/** Engine over canned AI output; these stages never touch Wikipedia, so summaries stay empty. */
const engineLayer = (object: unknown): Layer.Layer<ContentEngine> =>
  RealContentEngineLive.pipe(
    Layer.provide(AiServiceTest({ object })),
    Layer.provide(WikiClientTest({ summaries: {} })),
    Layer.provide(UnusedStorage),
  )

describe('RealContentEngine.produce — text enrichment stages', () => {
  it.effect('enrich_etymology returns the { etymology } slice', () =>
    Effect.gen(function* () {
      const engine = yield* ContentEngine
      const result = yield* engine.produce('enrich_etymology', enumLanguage.en, 'lacuna')

      expect(new Set(Object.keys(result))).toEqual(new Set(['etymology']))
      const decoded = Schema.decodeUnknownSync(EtymologySlice)(result)
      expect(decoded.etymology.summary).toContain('lacuna')
    }).pipe(Effect.provide(engineLayer(etymologyObject('lacuna')))),
  )

  it.effect('enrich_tiers returns the { tiers, relations, translations } slice', () =>
    Effect.gen(function* () {
      const engine = yield* ContentEngine
      const result = yield* engine.produce('enrich_tiers', enumLanguage.en, 'lacuna')

      expect(new Set(Object.keys(result))).toEqual(new Set(['tiers', 'relations', 'translations']))
      const decoded = Schema.decodeUnknownSync(TiersSlice)(result)
      expect(decoded.tiers.quick.body).toContain('lacuna')
      expect(decoded.translations).toHaveLength(1)
    }).pipe(Effect.provide(engineLayer(tiersObject('lacuna')))),
  )

  it.effect(
    'final_review returns the { frequency } slice — a plain text stage like the others',
    () =>
      Effect.gen(function* () {
        const engine = yield* ContentEngine
        const result = yield* engine.produce('final_review', enumLanguage.en, 'lacuna')

        // No provenance keys on the result — build provenance lives on the engine's `provenance`
        // (real-content-engine.provenance.test.ts), not smuggled through this slice.
        expect(new Set(Object.keys(result))).toEqual(new Set(['frequency']))
        const decoded = Schema.decodeUnknownSync(FrequencySlice)(result)
        expect(decoded.frequency.band).toBe(enumFrequencyBand.uncommon)
      }).pipe(Effect.provide(engineLayer(frequencyObject()))),
  )

  it.effect('fails failed, carrying the AiError reason + a serializable cause (AC-6)', () =>
    Effect.gen(function* () {
      const engine = yield* ContentEngine
      const error = yield* engine
        .produce('enrich_tiers', enumLanguage.en, 'lacuna')
        .pipe(Effect.flip)
      expect(error).toBeInstanceOf(ContentEngineError)
      expect(error.type).toBe('failed')

      // The message is the drilled AiError reason — no `"<stage> generation failed for ..."` prefix.
      expect(error.message).toBe('no object fixture')
      expect(error.message).not.toContain('enrich_tiers')

      // The cause is the serializable snapshot, not a live Error — it round-trips JSON unchanged.
      expect(error.cause).not.toBeInstanceOf(Error)
      expect(JSON.parse(JSON.stringify(error.cause))).toEqual(error.cause)
    }).pipe(Effect.provide(engineLayer(undefined))),
  )
})
