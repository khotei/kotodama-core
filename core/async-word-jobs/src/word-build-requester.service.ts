import {
  type EffectDrizzleQueryError,
  enumAsyncJobStatus,
  Language,
  WORD_JOB_STAGES,
} from '@lexiai/database'
import { type QueueError, QueueService } from '@lexiai/queue'
import { AsyncWordJobsRepo, stagePatch } from '@lexiai/repositories-async-word-jobs'
import { Context, Effect, Layer, Option, Schema } from 'effect'
import { WordBuildMessageFromJson } from './word-build-message.schema'
import { WordBuildState } from './word-build-state.service'
import { normalizeWordInput } from './word-input'
import type { WordStateModel } from './word-state.model'

/** The requested input was not a buildable word (empty / symbol-only). Maps to HTTP 422. */
export class InvalidWordInputError extends Schema.TaggedErrorClass<InvalidWordInputError>()(
  'InvalidWordInputError',
  { input: Schema.String },
  { httpApiStatus: 422 },
) {}

/** The word is already Ready (a `words` row exists), so there is nothing to build. Maps to HTTP 409. */
export class WordAlreadyReadyError extends Schema.TaggedErrorClass<WordAlreadyReadyError>()(
  'WordAlreadyReadyError',
  { language: Language, word: Schema.String },
  { httpApiStatus: 409 },
) {}

/** A build is already in progress for the word (active stages, no terminal failure). Maps to HTTP 409. */
export class WordBuildInProgressError extends Schema.TaggedErrorClass<WordBuildInProgressError>()(
  'WordBuildInProgressError',
  { language: Language, word: Schema.String },
  { httpApiStatus: 409 },
) {}

/**
 * The single, restricted creation path — one build per `(word, language)`. `request` reads the current
 * {@link WordBuildState} and acts only when a build should begin: it seeds the stage rows and
 * enqueues exactly one build for an absent (`Option.none`)/`failed` word and **returns the freshly-seeded
 * `running` {@link WordStateModel}** (the just-created resource). Every other state is a typed failure —
 * a `running` word ⇒ {@link WordBuildInProgressError}, a `succeeded` word ⇒ {@link WordAlreadyReadyError},
 * unbuildable input ⇒ {@link InvalidWordInputError}. The dedup/rejection policy lives here and nowhere else.
 *
 * The running state rides the success channel; the three rejections + genuine infrastructure faults
 * (DB or queue unreachable) ride the error channel — the handler surfaces the three domain errors as
 * HTTP 4xx and `die`s the infra ones.
 *
 * @see `core/async-word-jobs/CLAUDE.md`
 */
export class WordBuildRequester extends Context.Service<
  WordBuildRequester,
  {
    readonly request: (
      language: Language,
      word: string,
    ) => Effect.Effect<
      WordStateModel,
      | EffectDrizzleQueryError
      | QueueError
      | WordAlreadyReadyError
      | WordBuildInProgressError
      | InvalidWordInputError
    >
  }
>()('@lexiai/core-async-word-jobs/WordBuildRequester') {}

export const WordBuildRequesterLive = Layer.effect(
  WordBuildRequester,
  Effect.gen(function* () {
    const buildState = yield* WordBuildState
    const jobs = yield* AsyncWordJobsRepo
    const queue = yield* QueueService

    const request: WordBuildRequester['Service']['request'] = Effect.fnUntraced(
      function* (language, word) {
        // Guard the build entry: empty / symbol-only input never starts a build (AC-11); a phrase
        // proceeds on its first word (AC-10). One isomorphic normalizer so the FE and API agree.
        const input = normalizeWordInput(word)
        if (input._tag === 'invalid')
          return yield* Effect.fail(new InvalidWordInputError({ input: word }))
        const target = input.word

        const state = yield* buildState.get(language, target)
        // Succeeded ⇒ a `words` row exists; never recreate it this milestone (AC-6).
        if (Option.isSome(state) && state.value.status === enumAsyncJobStatus.succeeded)
          return yield* Effect.fail(new WordAlreadyReadyError({ language, word: target }))
        // Being made ⇒ active build, no terminal error; a second request can't start another (AC-7).
        if (Option.isSome(state) && state.value.status === enumAsyncJobStatus.running)
          return yield* Effect.fail(new WordBuildInProgressError({ language, word: target }))
        // `Option.none` (no job) or `failed` (a terminal error ⇒ a retry) — start a clean build:
        // seed every pipeline stage `pending`. The upsert on UNIQUE(word, language, stage) resets any
        // failed rows in place, so first build and retry are the same idempotent call; concurrent
        // requests can't duplicate rows.
        yield* jobs.saveStages(language, target, WORD_JOB_STAGES.map(stagePatch.pending))
        const body = Schema.encodeSync(WordBuildMessageFromJson)({ language, word: target })
        yield* queue.send(body)
        // Return the freshly-seeded `running` state — the just-created resource. It exists (we just
        // seeded the stage rows), so a `None` here is an impossible state, not a domain outcome.
        const seeded = yield* buildState.get(language, target)
        if (Option.isNone(seeded)) return yield* Effect.die(new Error('seeded build state missing'))
        return seeded.value
      },
    )

    return WordBuildRequester.of({ request })
  }),
)
