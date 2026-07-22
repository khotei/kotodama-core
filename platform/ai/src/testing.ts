import { Effect, Layer } from 'effect'
import { AiError, AiService } from './ai.service'

// Omit a field to make that method fail. `object` is returned verbatim for ANY schema/prompt —
// the fake does not decode, so the test must supply an already-shaped value.
export interface AiFixtures {
  readonly object?: unknown
  readonly image?: Uint8Array
}

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
