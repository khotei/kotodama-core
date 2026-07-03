import { BunRuntime } from '@effect/platform-bun'
import { ConfigProviderLive, Port } from '@lexiai/config'
import { Data, Effect } from 'effect'

// `bun run src/local-smoke.ts [word] [language]` — defaults build `en/lacuna`.
const [, , WORD = 'lacuna', LANGUAGE = 'en'] = process.argv
// 90 polls × 2s ≈ a 3-minute budget — generous for a cold real-engine build (text + image stages).
const MAX_POLLS = 90
const POLL_DELAY = '2 seconds'

class SmokeHttpError extends Data.TaggedError('SmokeHttpError')<{
  readonly url: string
  readonly status: number
  readonly cause: unknown
}> {}
class SmokeTimeout extends Data.TaggedError('SmokeTimeout')<{
  readonly word: string
  readonly language: string
}> {}
class SmokeBuildFailed extends Data.TaggedError('SmokeBuildFailed')<{ readonly stages: unknown }> {}

// Asserts the discriminant only, deliberately not the schema.
interface WireState {
  readonly status?: 'succeeded' | 'running' | 'failed'
  readonly stages?: unknown
}

const request = (method: 'GET' | 'POST', url: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, { method })
      const text = await response.text()
      return { status: response.status, body: (text ? JSON.parse(text) : null) as WireState | null }
    },
    catch: (cause) => new SmokeHttpError({ url, status: 0, cause }),
  }).pipe(
    Effect.flatMap(({ status, body }) =>
      status >= 200 && status < 300
        ? Effect.succeed(body)
        : Effect.fail(new SmokeHttpError({ url, status, cause: body })),
    ),
  )

// The explicit return type is required — the function is self-recursive.
const pollUntilSucceeded = (
  base: string,
  attempt = 1,
): Effect.Effect<void, SmokeHttpError | SmokeTimeout | SmokeBuildFailed> =>
  Effect.gen(function* () {
    if (attempt > MAX_POLLS) {
      return yield* Effect.fail(new SmokeTimeout({ word: WORD, language: LANGUAGE }))
    }
    const state = yield* request('GET', `${base}/state`)
    if (state?.status === 'succeeded') {
      return yield* Effect.log(`✓ ${LANGUAGE}/${WORD} reached "succeeded" after ${attempt} poll(s)`)
    }
    if (state?.status === 'failed') {
      return yield* Effect.fail(new SmokeBuildFailed({ stages: state.stages }))
    }
    yield* Effect.sleep(POLL_DELAY)
    return yield* pollUntilSucceeded(base, attempt + 1)
  })

// Needs `local:up` + both dev apps + a real OPENAI_API_KEY. A 409 on POST (already building /
// Ready) is a success for a smoke, so it is tolerated and the poll proceeds.
const program = Effect.gen(function* () {
  const port = yield* Port
  const base = `http://localhost:${port}/api/words/${LANGUAGE}/${WORD}`

  yield* Effect.log(`smoke: building ${LANGUAGE}/${WORD} via ${base}`)

  yield* request('POST', `${base}/build`).pipe(
    Effect.catchTag('SmokeHttpError', (error) =>
      error.status === 409 ? Effect.void : Effect.fail(error),
    ),
  )

  yield* pollUntilSucceeded(base)
})

program.pipe(Effect.provide(ConfigProviderLive), BunRuntime.runMain)
