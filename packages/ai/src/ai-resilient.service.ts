import { Effect, Layer, type Schema } from 'effect'
import { AiService, type ImageOptions } from './ai.service'
import { type ResilienceConfig, resilient } from './resilient'

/**
 * Decorate {@link AiService} with per-call resilience — every `generateObject` runs through
 * `resilient(_, text)` and every `generateImage` through `resilient(_, image)` (cap each attempt, retry
 * while the failure is transient). A **single-tag decorator layer**: it `yield*`s `AiService` — the
 * *base*, supplied via `Layer.provide(AiServiceLive)` — and re-provides the **same** tag wrapped, so the
 * base requirement is subtracted and consumers depend on the plain `AiService`, never seeing the
 * resilience seam. (Verified: providing the same tag a layer outputs is acyclic — `Layer.provide`
 * subtracts it; the base builds once.)
 *
 * This keeps retry **opt-in at wiring** (interpose this layer only where wanted), never an `AiService`
 * property — the content engine itself now makes bare `ai.*` calls, and the worker entrypoint wraps them
 * with the engine's presets. Replaces the old per-call-site `resilient(…, PRESET)` inside the engine.
 *
 * @example
 * ```ts
 * AiServiceResilient(TEXT_RESILIENCE, IMAGE_RESILIENCE).pipe(Layer.provide(AiServiceLive))
 * ```
 * @see `packages/ai/CLAUDE.md`
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
          readonly reasoningEffort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
        },
      ) => resilient(base.generateObject(schema, prompt, opts), text)

      const generateImage = (prompt: string, opts: ImageOptions) =>
        resilient(base.generateImage(prompt, opts), image)

      return AiService.of({ generateObject, generateImage })
    }),
  )
