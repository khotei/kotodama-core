import { expect, it } from '@effect/vitest'
import {
  type BuildStagesEntity,
  DB,
  enumAsyncJobStatus,
  enumJobErrorType,
  enumLanguage,
  enumWordJobStage,
  type Language,
  WORD_JOB_STAGES,
} from '@kotodama/core/database'
import { resetDb, TestDatabaseLive } from '@kotodama/core/database/testing'
import { searchWords, selectWord } from '@kotodama/core/repositories'
import { seedReadyWord, seedUnreadyWord } from '@kotodama/core/repositories/testing'
import { WordBuildMessageFromJson, WordVerdict } from '@kotodama/core/words'
import { AiServiceTest } from '@kotodama/platform/ai/testing'
import { drainQueue, QueueLocalStackLive } from '@kotodama/platform/queue/testing'
import { Effect, Layer, Option, Schema } from 'effect'
import { requestWordBuild } from '../src/index'

// The verifier's judge now rides `requestWordBuild`'s `R` (T07). Every test provides a canned
// `AiService` (no network): the file default admits (`isValid: true`) so the pre-filter is the only
// gate; the AC-11 test overrides it locally with an `isValid: false` verdict to exercise the judge reject.
const admitVerdict = WordVerdict.make({ isValid: true, reason: 'admit' })
const AiServiceAdmit = AiServiceTest({ object: admitVerdict })

// requestWordBuild = readWordBuildSnapshot ▸ ensureWordBuildable (guard) ▸ its own seed+enqueue action,
// returning the freshly-seeded `words` row (its inline `stages` are the running view) — plain functions
// over the repos (which `yield* DB`) + JobsQueue (real SQS via a per-file LocalStack container) ← DB.
// Two containers per file (Postgres + LocalStack); the flow bottoms out at DB + JobsQueue, which
// this layer provides — so a test can seed ground truths via the repos and inspect the queue.
const TestLayer = QueueLocalStackLive.pipe(
  Layer.provideMerge(TestDatabaseLive),
  Layer.provideMerge(AiServiceAdmit),
)

const EN = enumLanguage.en
const WORD = 'lacuna'
const PIPELINE_LENGTH = WORD_JOB_STAGES.length

// Stages now ride the `words` row (`words.stages`), so a test reads them off `selectWord`; an absent
// word yields no stages (the old `selectWordJobStages` returned an empty set for the same case).
const readStages = (language: Language, word: string) =>
  selectWord(language, word).pipe(
    Effect.map(
      Option.match({
        onNone: (): BuildStagesEntity => [],
        onSome: (row) => row.stages,
      }),
    ),
  )

// The LocalStack queue persists across this file's tests (one container per file); `drainQueue`
// receive-and-deletes everything, so call it at the top of each test (the SQS analogue of `resetDb`)
// and use its return value as the "what got enqueued?" assertion source.
it.layer(TestLayer, { timeout: '120 seconds' })((it) => {
  it.effect('Not-yet-made → running: seeds every stage + enqueues exactly one build (AC-3)', () =>
    Effect.gen(function* () {
      yield* resetDb
      yield* drainQueue

      const seeded = yield* requestWordBuild(EN, WORD)
      expect(seeded.stages).toHaveLength(PIPELINE_LENGTH)
      expect(seeded.stages.every((stage) => stage.status === enumAsyncJobStatus.pending)).toBe(true)

      // Exactly one build dispatched, carrying the (language, word) identity.
      const messages = yield* drainQueue
      expect(messages).toHaveLength(1)
      const [message] = messages
      expect(Schema.decodeUnknownSync(WordBuildMessageFromJson)(message?.body ?? '')).toEqual({
        language: EN,
        word: WORD,
      })

      // The whole pipeline is seeded `pending` on the row.
      const stages = yield* readStages(EN, WORD)
      expect(stages).toHaveLength(PIPELINE_LENGTH)
      expect(stages.every((stage) => stage.status === enumAsyncJobStatus.pending)).toBe(true)
    }),
  )

  it.effect(
    'seeds a pending words row in the same tx as the stages — the word is listable before the worker runs (AC-4)',
    () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* drainQueue

        yield* requestWordBuild(EN, WORD)

        // The word IS a `words` row the instant the build is requested — `status='pending'`, content NULL —
        // so it appears in list/search/counts with no aggregate. This is what preserves F-CONT-005's
        // no-staleness guarantee by construction (the seeded row is the list entry).
        const seededRow = yield* selectWord(EN, WORD)
        expect(Option.isSome(seededRow)).toBe(true)
        expect(Option.getOrThrow(seededRow).status).toBe(enumAsyncJobStatus.pending)
        expect(Option.getOrThrow(seededRow).coreDefinition).toBeNull()

        // ...and it is listable via the summaries read (what the /search endpoint serves) before any
        // worker has run — the pending row surfaces immediately.
        const { items } = yield* searchWords({ language: EN, limit: 20 })
        expect(items.map((item) => item.word)).toContain(WORD)

        // The seed and its 6 pending stages landed together on the one row (same write).
        const stages = yield* readStages(EN, WORD)
        expect(stages).toHaveLength(PIPELINE_LENGTH)
      }),
  )

  it.effect(
    'a failure after the seed rolls the whole tx back — no orphan pending words row (AC-4)',
    () =>
      Effect.gen(function* () {
        yield* resetDb

        // The atomicity contract requestWordBuild leans on: the pending row and its inline stages are
        // ONE write inside a db.transaction, so any failure in the body unwinds the seed too — a word
        // never appears half-registered. Reproduce the composition and fail *after* the seed; the
        // pending row must not survive.
        const db = yield* DB
        const boom = yield* db
          .transaction(() =>
            Effect.gen(function* () {
              yield* seedUnreadyWord(EN, WORD)
              return yield* Effect.fail(new Error('stage write failed'))
            }),
          )
          .pipe(Effect.flip)
        expect(boom.message).toBe('stage write failed')

        // Rolled back: no orphan pending row (and so nothing in list/search).
        expect(Option.isNone(yield* selectWord(EN, WORD))).toBe(true)
        const { items } = yield* searchWords({ language: EN, limit: 20 })
        expect(items.map((item) => item.word)).not.toContain(WORD)
      }),
  )

  it.effect(
    'Being-made → WordBuildInProgressError: no new build, no second enqueue, no duplicate rows (AC-7, AC-8)',
    () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* drainQueue

        expect((yield* requestWordBuild(EN, WORD)).stages).toHaveLength(PIPELINE_LENGTH)
        const afterFirst = yield* readStages(EN, WORD)

        // The load-bearing dedup invariant: a second create while Being-made fails, starting nothing new.
        const error = yield* requestWordBuild(EN, WORD).pipe(Effect.flip)
        expect(error._tag).toBe('WordBuildInProgressError')

        // One message total — the second request enqueued nothing — and no duplicate rows.
        expect(yield* drainQueue).toHaveLength(1)
        const afterSecond = yield* readStages(EN, WORD)
        expect(afterSecond).toHaveLength(PIPELINE_LENGTH)
        expect(afterSecond).toHaveLength(afterFirst.length)
      }),
  )

  it.effect('Ready → WordAlreadyReadyError: nothing enqueued, no build seeded (AC-6)', () =>
    Effect.gen(function* () {
      yield* resetDb
      yield* drainQueue
      yield* seedReadyWord(EN, WORD)

      const error = yield* requestWordBuild(EN, WORD).pipe(Effect.flip)
      expect(error._tag).toBe('WordAlreadyReadyError')
      expect(yield* drainQueue).toHaveLength(0)
      // No fresh build was seeded — the ready row's stages stay `succeeded`, never reset to `pending`.
      const stages = yield* readStages(EN, WORD)
      expect(stages.every((stage) => stage.status === enumAsyncJobStatus.succeeded)).toBe(true)
    }),
  )

  it.effect('Couldn’t-be-made → running: a retry request reseeds a clean build + re-enqueues', () =>
    Effect.gen(function* () {
      yield* resetDb
      yield* drainQueue
      // Drive the word terminal-failed (the Couldn't-be-made state): a `failed` row whose stages
      // record the failing pass, which is buildable — a re-request retries it.
      const failedStages: BuildStagesEntity = WORD_JOB_STAGES.map((stage) =>
        stage === enumWordJobStage.fetch_source
          ? {
              stage,
              status: enumAsyncJobStatus.failed,
              error: { message: 'no source found', type: enumJobErrorType.not_found },
            }
          : { stage, status: enumAsyncJobStatus.pending },
      )
      yield* seedUnreadyWord(EN, WORD, enumAsyncJobStatus.failed, failedStages)

      expect((yield* requestWordBuild(EN, WORD)).stages).toHaveLength(PIPELINE_LENGTH)
      // A clean new build: stages reset to pending, one fresh dispatch.
      const stages = yield* readStages(EN, WORD)
      expect(stages.every((stage) => stage.status === enumAsyncJobStatus.pending)).toBe(true)
      expect(yield* drainQueue).toHaveLength(1)
    }),
  )

  it.effect(
    'concurrent requests for the same new word race to one build — no duplicate rows (AC-8)',
    () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* drainQueue

        // Recover each to a tag sentinel — the losers fail WordBuildInProgressError, which would
        // otherwise short-circuit Effect.all.
        const tags = yield* Effect.all(
          Array.from({ length: 5 }, () =>
            requestWordBuild(EN, WORD).pipe(
              Effect.match({
                onFailure: () => 'rejected' as const,
                onSuccess: () => 'running' as const,
              }),
            ),
          ),
          { concurrency: 'unbounded' },
        )

        // At least one request started the build; the UNIQUE(word, language) upsert lands the pipeline
        // idempotently on the one row, so the race yields a single full stage set.
        expect(tags).toContain('running')
        expect(yield* readStages(EN, WORD)).toHaveLength(PIPELINE_LENGTH)
      }),
  )

  it.effect(
    'symbol-only input → InvalidWordInputError: nothing seeded, nothing enqueued (AC-11)',
    () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* drainQueue

        const error = yield* requestWordBuild(EN, '!!!').pipe(Effect.flip)
        expect(error._tag).toBe('InvalidWordInputError')
        expect(yield* drainQueue).toHaveLength(0)
        expect(yield* readStages(EN, '!!!')).toHaveLength(0)
      }),
  )

  it.effect(
    'judge rejects a plausible-looking input → InvalidWordInputError: no jobs seeded, nothing enqueued (AC-11)',
    () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* drainQueue

        // A word that clears the deterministic pre-filter (short, in-limit) but the judge deems invalid —
        // isolating the LLM gate from the local floor. The local AiService override wins over the file default.
        const rejectVerdict = WordVerdict.make({ isValid: false, reason: 'not a real word' })
        const error = yield* requestWordBuild(EN, 'asdfgh').pipe(
          Effect.provide(AiServiceTest({ object: rejectVerdict })),
          Effect.flip,
        )
        expect(error._tag).toBe('InvalidWordInputError')

        // The gate fires before any seed/enqueue action.
        expect(yield* drainQueue).toHaveLength(0)
        expect(yield* readStages(EN, 'asdfgh')).toHaveLength(0)
      }),
  )

  it.effect('a short collocation builds verbatim, not just its first word (AC-13)', () =>
    Effect.gen(function* () {
      yield* resetDb
      yield* drainQueue

      const collocation = 'faux pas'
      expect((yield* requestWordBuild(EN, collocation)).stages).toHaveLength(PIPELINE_LENGTH)

      // The relaxed normalizer keeps the whole collocation — the phrase itself is the built word.
      expect(yield* readStages(EN, collocation)).toHaveLength(PIPELINE_LENGTH)
      expect(yield* readStages(EN, 'faux')).toHaveLength(0)
      const [message] = yield* drainQueue
      expect(Schema.decodeUnknownSync(WordBuildMessageFromJson)(message?.body ?? '')).toEqual({
        language: EN,
        word: collocation,
      })
    }),
  )
})
