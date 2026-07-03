import { Duration, Effect, Schedule } from 'effect'
import { AiError } from './ai.service'

/**
 * The values are the consumer's tuning, not a property of `AiService` — the content engine's
 * presets live in its `generation-defaults.ts`.
 */
export interface ResilienceConfig {
  /** Only a label, stamped on the AiError synthesized when a leftover timeout is the final failure. */
  readonly method: AiError['method']
  readonly timeout: Duration.Duration
  readonly retries: number
}

// Exponential from 3s, jittered — sized so ~4 image retries (3/6/12/24s) clear a gpt-image
// rate-limit window (the 429 hint is ~12s).
const RETRY_BACKOFF = Schedule.exponential(Duration.seconds(3)).pipe(Schedule.jittered)

/**
 * Cap each attempt and retry while the failure is transient (a retryable {@link AiError} or our
 * own per-attempt timeout); a leftover timeout maps back to `AiError`, so the channel is unchanged.
 * A standalone wrapper, not a service method: retry is opt-in at wiring, and it knows only
 * `AiError`, so any consumer can reuse it.
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
