import {
  MockContentEngine,
  WordGenerationService,
  WordGenerationServiceLive,
} from '@kotodama/core/content'
import { WordBuildMessageFromJson } from '@kotodama/core/words'
import { Effect, Layer, Schema } from 'effect'

/** Encode a `WordBuildMessage` to the JSON wire body an SQS record carries. */
export const encode = Schema.encodeSync(WordBuildMessageFromJson)

/** The sentinel word whose generation *dies* (an unrecoverable defect, not a typed failure). */
export const BOOM = 'boom'

/**
 * A generation seam delegating every word to the real mock-backed service, except {@link BOOM},
 * which it `die`s — the way `createWord`'s `orDie` on a malformed assembly would. A single-tag
 * decorator over `WordGenerationServiceLive` (same shape as `withBuildBudget`), transparent for every
 * non-`BOOM` word — so the batch's defect-isolation contract is exercised without a malformed-content
 * fixture.
 */
export const DefectGenerationLive = Layer.effect(
  WordGenerationService,
  Effect.gen(function* () {
    const base = yield* WordGenerationService
    return WordGenerationService.of({
      generate: (language, word) =>
        word === BOOM ? Effect.die(new Error('malformed assembly')) : base.generate(language, word),
    })
  }),
).pipe(Layer.provide(WordGenerationServiceLive.pipe(Layer.provide(MockContentEngine))))
