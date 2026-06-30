import { Effect, Layer } from 'effect'
import { AiError, AiService } from './ai.service'

/**
 * Canned results for {@link AiServiceTest}. Omit a field to make that method fail with {@link AiError}
 * (so a downstream suite can exercise its own error handling without a real provider).
 *
 * `object` is returned verbatim for **any** `schema`/`prompt` — the fake does not decode, so the test
 * is responsible for supplying a value already shaped like the schema it passes to `generateObject`.
 */
export interface AiFixtures {
  readonly object?: unknown
  readonly image?: Uint8Array
}

/**
 * A fixture-backed {@link AiService} for downstream suites — no OpenAI, no network, no API key.
 *
 * @example
 * ```ts
 * it.effect('builds a word', () =>
 *   program.pipe(Effect.provide(AiServiceTest({ object: cannedEntry, image: pngBytes }))))
 * ```
 */
export const AiServiceTest = (fixtures: AiFixtures = {}): Layer.Layer<AiService> =>
  Layer.succeed(
    AiService,
    AiService.of({
      generateObject: <A>(_schema: unknown, _prompt: string, _opts: unknown) =>
        fixtures.object === undefined
          ? Effect.fail(AiError.fromCause('generateObject', new Error('no object fixture')))
          : Effect.succeed(fixtures.object as A),
      generateImage: (_prompt, _opts) =>
        fixtures.image === undefined
          ? Effect.fail(AiError.fromCause('generateImage', new Error('no image fixture')))
          : Effect.succeed(fixtures.image),
    }),
  )
