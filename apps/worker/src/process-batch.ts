import { WordBuilder, WordBuildMessageFromJson } from '@lexiai/core-async-word-jobs'
import { Effect, Option, Schema } from 'effect'

/**
 * A queue record reduced to what the consume core needs: a **stable id** (the prod edge passes the
 * SQS `messageId`, the local edge the receipt `handle`) and the opaque `body`. The core stays
 * transport-agnostic — it knows nothing of SQS or `QueueService`; each driver maps its own message
 * shape to this.
 */
export interface BatchRecord {
  readonly id: string
  readonly body: string
}

/** Match a received body against the build-message shape — `none` for anything that isn't one. */
const matchBuildMessage = Schema.decodeUnknownOption(WordBuildMessageFromJson)

// Fixed in-code bound (D3): under Lambda ESM a batch is ≤10 and AWS parallelizes across *invocations*,
// so per-invocation concurrency isn't throughput-critical — a small constant, not a config knob.
const CONCURRENCY = 10

/**
 * The driver-agnostic consume core: run a batch of records and return the ids of the ones whose build
 * **failed** (a DB error — the redrive case). Both edges share this, so the prod handler and the local
 * poll-loop are behaviourally identical by construction.
 *
 * Per record: decode the body; a foreign body (`none`) is **skipped** — neither built nor failed (so
 * an edge treats it as a success and acks it). A `WordBuildMessage` runs `WordBuilder.build`; a failure
 * is **caught and isolated** — its id is collected and the other records still run.
 *
 * The core **never acks** — hence no `QueueService` in `R` (only `WordBuilder`): the edge decides what
 * "absent from `failedIds`" means (prod: AWS deletes; local: the loop deletes). Idempotency is
 * `WordBuilder`'s (a redelivered message converges on one word).
 */
export const processBatch = (
  records: ReadonlyArray<BatchRecord>,
): Effect.Effect<ReadonlyArray<string>, never, WordBuilder> =>
  Effect.gen(function* () {
    const builder = yield* WordBuilder
    const outcomes = yield* Effect.forEach(
      records,
      (record) =>
        Option.match(matchBuildMessage(record.body), {
          onNone: () => Effect.succeed(Option.none<string>()),
          onSome: ({ language, word }) =>
            builder.build(language, word).pipe(
              Effect.match({
                onFailure: () => Option.some(record.id),
                onSuccess: () => Option.none<string>(),
              }),
            ),
        }),
      { concurrency: CONCURRENCY },
    )
    return outcomes.filter(Option.isSome).map((some) => some.value)
  })
