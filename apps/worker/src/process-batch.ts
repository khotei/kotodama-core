import { WordBuildMessageFromJson } from '@lexiai/core-async-word-jobs'
import { buildWord } from '@lexiai/use-cases'
import { Array as Arr, Context, Effect, Option, Schema } from 'effect'

/**
 * A queue record reduced to what the consume core needs: a **stable id** (the prod edge passes the
 * SQS `messageId`, the local edge the receipt `handle`) and the opaque `body`. The core stays
 * transport-agnostic — it knows nothing of SQS or `JobsQueue`; each driver maps its own message
 * shape to this.
 */
export interface BatchRecord {
  readonly id: string
  readonly body: string
}

/** Match a received body against the build-message shape — `none` for anything that isn't one. */
const matchBuildMessage = Schema.decodeUnknownOption(WordBuildMessageFromJson)

/**
 * How many builds in a batch run at once — a {@link Context.Reference} so production wires nothing
 * (the default) while the worker entrypoint overrides it from `WORKER_CONCURRENCY` (`main.ts`) and tests
 * `Layer.succeed` a value. **Default 1:** at a low OpenAI usage tier the `gpt-image` rate limit (≈5
 * images/min) means even one word's ~11 renders nearly fills the window, so concurrent builds collide on
 * a 429 — raise it once a higher tier lifts the limit. (Under Lambda ESM a batch is ≤10 and AWS
 * parallelizes across *invocations*, so this caps per-invocation fan-out, not overall throughput.)
 */
export const BatchConcurrency = Context.Reference<number>('@lexiai/app-worker/BatchConcurrency', {
  defaultValue: () => 1,
})

/**
 * The driver-agnostic consume core: run a batch of records and return the ids of the ones whose build
 * **failed** (a DB error — the redrive case). Both edges share this, so the prod handler and the local
 * poll-loop are behaviourally identical by construction.
 *
 * Per record: decode the body; a foreign body (`none`) is **skipped** — neither built nor failed (so
 * an edge treats it as a success and acks it). A `WordBuildMessage` runs {@link buildWord}; a failure
 * **or defect** is **caught and isolated** (`matchCause`) — its id is collected and the other records
 * still run.
 *
 * The core **never acks** — hence no `JobsQueue` in `R` (only `buildWord`'s `ContentEngine | DB`):
 * the edge decides what "absent from `failedIds`" means (prod: AWS deletes; local: the loop deletes).
 * Idempotency is `buildWord`'s (a redelivered message converges on one word).
 */
export const processBatch = Effect.fnUntraced(function* (records: ReadonlyArray<BatchRecord>) {
  const concurrency = yield* BatchConcurrency
  const outcomes = yield* Effect.forEach(
    records,
    (record) =>
      Option.match(matchBuildMessage(record.body), {
        onNone: () => Effect.succeed(Option.none<string>()),
        onSome: ({ language, word }) =>
          buildWord(language, word).pipe(
            // Root span per build: every sub-span (sql, the AI calls) nests under it, and every
            // `Effect.log*` inside the build attaches to it as an event — the default `tracerLogger`
            // only records logs when there is a current span. So a whole build is one searchable trace
            // in Jaeger, tagged `word.text` / `word.language`, with its logs on the timeline.
            Effect.withSpan('BuildWord.run', {
              attributes: { 'word.text': word, 'word.language': language },
            }),
            // `matchCause`, not `match`: a typed failure AND a defect (e.g. `createWord`'s `orDie`
            // on a malformed assembly) both become this record's failed id. A bare `match` is E-only,
            // so a defect would propagate, tear down the whole `forEach`, and in prod throw past the
            // edge's `never` channel — making AWS replay the entire (already-built) batch.
            Effect.matchCause({
              onFailure: () => Option.some(record.id),
              onSuccess: () => Option.none<string>(),
            }),
          ),
      }),
    { concurrency },
  )
  return Arr.getSomes(outcomes)
})
