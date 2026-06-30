import { Duration, Effect, Schedule } from 'effect'
import { AiError } from './ai.service'

/**
 * Backoff before each transient retry: exponential from 3s, jittered. The 3s base (× up to ~4 image
 * retries → ~3/6/12/24s) is sized to clear a `gpt-image` rate-limit window (the 429 hint is ~12s),
 * while staying short enough for a one-off transport stall.
 */
const RETRY_BACKOFF = Schedule.exponential(Duration.seconds(3)).pipe(Schedule.jittered)

/**
 * One call's resilience policy — the per-attempt wall-clock cap, how many transient retries, and the
 * `method` to stamp on the {@link AiError} synthesized if a leftover timeout is the *final* failure.
 * The values are the **consumer's** tuning, not a property of `AiService`; the content engine's two
 * presets live in `generation-defaults.ts` (`@lexiai/core-content`).
 */
export interface ResilienceConfig {
  /** Tags the synthesized timeout-`AiError`. Only a label — downstream reads `message`/`cause`. */
  readonly method: AiError['method']
  readonly timeout: Duration.Duration
  readonly retries: number
}

/**
 * Make one OpenAI call resilient: cap each attempt at `config.timeout` and retry **while the failure is
 * transient** — a provider-flagged retryable {@link AiError} (`TransportError` / 5xx / rate-limit, via
 * {@link AiError.isRetryable}) or our own per-attempt timeout (a stalled socket). After the retries are
 * spent a leftover timeout is mapped back to an `AiError`, so the channel stays `AiError` for the
 * caller's error-wrapper.
 *
 * This is the **consumer's** resilience policy (the rule: retry is opt-in at the call site, never an
 * `AiService` property), so it lives here as a standalone wrapper rather than inside the service — the
 * caller chooses to wrap a call and supplies the per-call {@link ResilienceConfig}. It knows only
 * `AiError`, so any `AiService` consumer can reuse it.
 *
 * @example
 * ```ts
 * const slice = yield* resilient(ai.generateObject(schema, prompt, opts), TEXT_RESILIENCE)
 * const bytes = yield* resilient(ai.generateImage(prompt, opts), IMAGE_RESILIENCE)
 * ```
 */
export const resilient = <A>(
  call: Effect.Effect<A, AiError>,
  config: ResilienceConfig,
): Effect.Effect<A, AiError> =>
  call.pipe(
    Effect.timeout(config.timeout),
    Effect.retry({
      while: (error) => error._tag === 'TimeoutError' || error.isRetryable,
      times: config.retries,
      schedule: RETRY_BACKOFF,
    }),
    Effect.catchTag('TimeoutError', (cause) =>
      Effect.fail(AiError.fromCause(config.method, cause)),
    ),
  )
