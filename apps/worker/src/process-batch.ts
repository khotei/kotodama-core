import { WordBuildMessageFromJson } from '@kotodama/core-words'
import { buildWord } from '@kotodama/use-cases'
import { Array as Arr, Context, Effect, Option, Schema } from 'effect'

// The prod edge passes the SQS `messageId` as `id`; the local edge the receipt `handle`.
export interface BatchRecord {
  readonly id: string
  readonly body: string
}

/**
 * Default 1: at the current OpenAI tier one word's ~11 renders nearly fills the gpt-image
 * rate-limit window, so concurrent builds collide on 429s — raise once a higher tier lifts it.
 * Caps per-invocation fan-out only (AWS parallelizes across invocations).
 */
export const BatchConcurrency = Context.Reference<number>('@kotodama/app-worker/BatchConcurrency', {
  defaultValue: () => 1,
})

const matchBuildMessage = Schema.decodeUnknownOption(WordBuildMessageFromJson)

/**
 * The driver-agnostic consume core — returns the failed record ids. It **never acks** (no
 * `JobsQueue` in `R`), so the two edges are identical by construction. A foreign body is skipped —
 * neither built nor failed, so the edge acks it rather than looping it forever.
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
            // Root span per build — logs only attach to a trace when a current span exists.
            Effect.withSpan('BuildWord.run', {
              attributes: { 'word.text': word, 'word.language': language },
            }),
            // `matchCause`, not `match`: a bare `match` is E-only, so a defect would tear down the
            // whole batch and, in prod, throw past the edge's `never` channel — making AWS replay
            // the entire (already-built) batch.
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
