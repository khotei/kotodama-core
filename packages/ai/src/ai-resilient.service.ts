import { Effect, Layer, type Schema } from 'effect'
import { AiService, type ImageOptions, type ReasoningEffort } from './ai.service'
import { type ResilienceConfig, resilient } from './resilient'

/**
 * Single-tag decorator: yields the base `AiService` (supplied via `Layer.provide(AiServiceLive)`)
 * and re-provides the same tag with every call wrapped in `resilient` — verified acyclic
 * (`Layer.provide` subtracts the requirement; the base builds once). Interpose only where wanted:
 * retry stays a wiring choice, never an `AiService` property.
 */
export const AiServiceResilient = (
  text: ResilienceConfig,
  image: ResilienceConfig,
): Layer.Layer<AiService, never, AiService> =>
  Layer.effect(
    AiService,
    Effect.gen(function* () {
      const base = yield* AiService

      const generateObject = <A, I extends Record<string, unknown>>(
        schema: Schema.Codec<A, I>,
        prompt: string,
        opts: {
          readonly model: string
          readonly reasoningEffort: ReasoningEffort
        },
      ) => resilient(base.generateObject(schema, prompt, opts), text)

      const generateImage = (prompt: string, opts: ImageOptions) =>
        resilient(base.generateImage(prompt, opts), image)

      return AiService.of({ generateObject, generateImage })
    }),
  )
