import { expect, it } from '@effect/vitest'
import { Duration, Effect, Fiber, Layer, Ref, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import { AiError, AiService } from '../src/ai.service'
import { AiServiceResilient } from '../src/ai-resilient.service'
import type { ResilienceConfig } from '../src/resilient'

// AiServiceResilient relocates `resilient` from the engine's call sites into a decorator layer; this
// pins that the decorator actually wraps BOTH methods (a bare base would fail on the first attempt).
// The internal backoff is `Schedule.exponential(3s).jittered`, so the retries sleep on the clock —
// fork + TestClock.adjust drives them without real waiting.

const CFG: ResilienceConfig = {
  method: 'generateImage',
  timeout: Duration.seconds(110),
  retries: 4,
}
const IMG = { model: 'gpt-image-1.5', size: '1024x1024', quality: 'low' } as const
const TEXT = { model: 'gpt-5.5', reasoningEffort: 'low' } as const
const Obj = Schema.Struct({ ok: Schema.String })

const transient = (method: AiError['method']) =>
  new AiError({ method, message: 'flake', cause: {}, isRetryable: true })

/**
 * A base {@link AiService} whose chosen method fails (transient) `failTimes` then succeeds, counting
 * calls into `calls`. The other method is unused (fails — never called by the test). Schema args are
 * `unknown` like {@link AiServiceTest}: the fake never decodes.
 */
const flakyBase = (
  which: 'object' | 'image',
  failTimes: number,
  calls: Ref.Ref<number>,
): Layer.Layer<AiService> =>
  Layer.succeed(
    AiService,
    AiService.of({
      generateObject: <A>(_s: unknown, _p: string, _o: unknown) =>
        which === 'object'
          ? Ref.updateAndGet(calls, (n) => n + 1).pipe(
              Effect.flatMap((n) =>
                n <= failTimes
                  ? Effect.fail(transient('generateObject'))
                  : Effect.succeed({ ok: 'yes' } as A),
              ),
            )
          : Effect.fail(transient('generateObject')),
      generateImage: (_p, _o) =>
        which === 'image'
          ? Ref.updateAndGet(calls, (n) => n + 1).pipe(
              Effect.flatMap((n) =>
                n <= failTimes
                  ? Effect.fail(transient('generateImage'))
                  : Effect.succeed(new Uint8Array([1, 2, 3])),
              ),
            )
          : Effect.fail(transient('generateImage')),
    }),
  )

it.effect('retries a transient generateImage failure, then succeeds', () =>
  Effect.gen(function* () {
    const calls = yield* Ref.make(0)
    const program = Effect.gen(function* () {
      const ai = yield* AiService
      return yield* ai.generateImage('a fox', IMG)
    }).pipe(
      Effect.provide(
        AiServiceResilient(CFG, CFG).pipe(Layer.provide(flakyBase('image', 2, calls))),
      ),
    )

    const fiber = yield* program.pipe(Effect.forkChild)
    // Two backoffs (≤3s, ≤6s jittered) — adjust generously past each.
    yield* TestClock.adjust(Duration.minutes(1))
    yield* TestClock.adjust(Duration.minutes(1))
    const bytes = yield* Fiber.join(fiber)

    expect(yield* Ref.get(calls)).toBe(3) // 2 fails + 1 success — the decorator retried
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]))
  }),
)

it.effect('retries a transient generateObject failure, then succeeds', () =>
  Effect.gen(function* () {
    const calls = yield* Ref.make(0)
    const program = Effect.gen(function* () {
      const ai = yield* AiService
      return yield* ai.generateObject(Obj, 'p', TEXT)
    }).pipe(
      Effect.provide(
        AiServiceResilient(CFG, CFG).pipe(Layer.provide(flakyBase('object', 1, calls))),
      ),
    )

    const fiber = yield* program.pipe(Effect.forkChild)
    yield* TestClock.adjust(Duration.minutes(1))
    const value = yield* Fiber.join(fiber)

    expect(yield* Ref.get(calls)).toBe(2) // 1 fail + 1 success
    expect(value).toEqual({ ok: 'yes' })
  }),
)
