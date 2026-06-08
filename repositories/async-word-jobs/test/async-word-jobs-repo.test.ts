import { expect, it } from '@effect/vitest'
import { enumAsyncJobStatus, enumLanguage, enumWordJobStage, wordJobStage } from '@lexiai/database'
import { resetDb, TestDatabaseLive } from '@lexiai/database/testing'
import { Effect, Exit, Layer } from 'effect'
import { AsyncWordJobsRepo, AsyncWordJobsRepoLive, WordStageNotFoundError } from '../src/index'

const TestLayer = AsyncWordJobsRepoLive.pipe(Layer.provideMerge(TestDatabaseLive))

// Sourced from the pgEnum, not re-listed.
const ALL_STAGES = wordJobStage.enumValues
const LANG = enumLanguage.en
const WORD = 'lacuna'

it.layer(TestLayer, { timeout: '120 seconds' })((it) => {
  it.effect('initialize seeds one pending row per stage', () =>
    Effect.gen(function* () {
      yield* resetDb
      const repo = yield* AsyncWordJobsRepo

      const rows = yield* repo.initializeStages(LANG, WORD)
      expect(rows).toHaveLength(ALL_STAGES.length)
      expect(new Set(rows.map((r) => r.stage))).toEqual(new Set(ALL_STAGES))
      expect(rows.every((r) => r.status === enumAsyncJobStatus.pending)).toBe(true)
      expect(rows.every((r) => r.attempts === 0)).toBe(true)
      expect(rows.every((r) => r.word === WORD && r.language === LANG)).toBe(true)

      // A subset is honoured (the caller plans which stages to run).
      const reset = yield* repo.initializeStages(LANG, 'other', [enumWordJobStage.fetch_source])
      expect(reset.map((r) => r.stage)).toEqual([enumWordJobStage.fetch_source])
    }),
  )

  it.effect('initialize resets in place: regen returns a generated word to pending', () =>
    Effect.gen(function* () {
      yield* resetDb
      const repo = yield* AsyncWordJobsRepo

      const [first] = yield* repo.initializeStages(LANG, WORD, [enumWordJobStage.fetch_source])
      yield* repo.patchStages(LANG, WORD, {
        stage: enumWordJobStage.fetch_source,
        status: enumAsyncJobStatus.succeeded,
        result: { coreDefinition: 'a gap' },
      })

      // Re-initialize (regen) clears the prior outcome on the SAME row — no second row, no history.
      const [again] = yield* repo.initializeStages(LANG, WORD, [enumWordJobStage.fetch_source])
      expect(again?.id).toBe(first?.id)
      expect(again?.status).toBe(enumAsyncJobStatus.pending)
      expect(again?.result).toBeNull()
      expect(again?.finishedAt).toBeNull()
      expect(yield* repo.findStages({ language: LANG, word: WORD })).toHaveLength(1)
    }),
  )

  it.effect('find: scoped read; stage/status take a value or an array', () =>
    Effect.gen(function* () {
      yield* resetDb
      const repo = yield* AsyncWordJobsRepo
      yield* repo.initializeStages(LANG, WORD)

      // all the word's stages (unordered).
      const all = yield* repo.findStages({ language: LANG, word: WORD })
      expect(all).toHaveLength(ALL_STAGES.length)
      expect(new Set(all.map((r) => r.stage))).toEqual(new Set(ALL_STAGES))

      // scoped to (word, language): another word is invisible.
      expect(yield* repo.findStages({ language: LANG, word: 'absent' })).toHaveLength(0)

      yield* repo.patchStages(LANG, WORD, {
        stage: enumWordJobStage.fetch_source,
        status: enumAsyncJobStatus.running,
      })
      // status as a single value.
      const running = yield* repo.findStages({
        language: LANG,
        word: WORD,
        status: enumAsyncJobStatus.running,
      })
      expect(running.map((r) => r.stage)).toEqual([enumWordJobStage.fetch_source])

      // status as a set — "is it active?".
      const active = yield* repo.findStages({
        language: LANG,
        word: WORD,
        status: [enumAsyncJobStatus.pending, enumAsyncJobStatus.running],
      })
      expect(active).toHaveLength(ALL_STAGES.length)

      // stage as a single value, and as an array.
      expect(
        yield* repo.findStages({
          language: LANG,
          word: WORD,
          stage: enumWordJobStage.fetch_source,
        }),
      ).toHaveLength(1)
      expect(
        yield* repo.findStages({
          language: LANG,
          word: WORD,
          stage: [enumWordJobStage.fetch_source, enumWordJobStage.final_review],
        }),
      ).toHaveLength(2)
    }),
  )

  it.effect(
    'patchStages (single): running stamps startedAt + attempts; succeed/fail stamp finishedAt + result/error',
    () =>
      Effect.gen(function* () {
        yield* resetDb
        const repo = yield* AsyncWordJobsRepo
        yield* repo.initializeStages(LANG, WORD)

        const running = yield* repo.patchStages(LANG, WORD, {
          stage: enumWordJobStage.fetch_source,
          status: enumAsyncJobStatus.running,
        })
        expect(running.status).toBe(enumAsyncJobStatus.running)
        expect(running.startedAt).toBeInstanceOf(Date)
        expect(running.attempts).toBe(1)
        // a second running bumps attempts again (retry).
        expect(
          (yield* repo.patchStages(LANG, WORD, {
            stage: enumWordJobStage.fetch_source,
            status: enumAsyncJobStatus.running,
          })).attempts,
        ).toBe(2)

        const ok = yield* repo.patchStages(LANG, WORD, {
          stage: enumWordJobStage.fetch_source,
          status: enumAsyncJobStatus.succeeded,
          result: { coreDefinition: 'an unfilled space; a gap' },
        })
        expect(ok.status).toBe(enumAsyncJobStatus.succeeded)
        expect(ok.finishedAt).toBeInstanceOf(Date)
        expect(ok.result).toEqual({ coreDefinition: 'an unfilled space; a gap' })

        const bad = yield* repo.patchStages(LANG, WORD, {
          stage: enumWordJobStage.enrich_visuals,
          status: enumAsyncJobStatus.failed,
          error: { message: 'image gen failed' },
        })
        expect(bad.status).toBe(enumAsyncJobStatus.failed)
        expect(bad.error?.message).toBe('image gen failed')
      }),
  )

  it.effect('patchStages (array) applies every patch and returns a row per patch', () =>
    Effect.gen(function* () {
      yield* resetDb
      const repo = yield* AsyncWordJobsRepo
      yield* repo.initializeStages(LANG, WORD)

      const rows = yield* repo.patchStages(LANG, WORD, [
        {
          stage: enumWordJobStage.fetch_source,
          status: enumAsyncJobStatus.succeeded,
          result: { ok: true },
        },
        { stage: enumWordJobStage.enrich_tiers, status: enumAsyncJobStatus.running },
      ])
      expect(rows).toHaveLength(2)
      expect(new Set(rows.map((r) => r.stage))).toEqual(
        new Set([enumWordJobStage.fetch_source, enumWordJobStage.enrich_tiers]),
      )

      const fetch = yield* repo.findStages({
        language: LANG,
        word: WORD,
        stage: enumWordJobStage.fetch_source,
      })
      expect(fetch[0]?.status).toBe(enumAsyncJobStatus.succeeded)
      expect(fetch[0]?.result).toEqual({ ok: true })
    }),
  )

  it.effect('patchStages (array) is atomic: one bad stage rolls the whole batch back', () =>
    Effect.gen(function* () {
      yield* resetDb
      const repo = yield* AsyncWordJobsRepo
      yield* repo.initializeStages(LANG, WORD, [enumWordJobStage.fetch_source])

      // fetch_source is initialized; enrich_tiers is NOT — the batch must fail and undo fetch_source.
      const exit = yield* Effect.exit(
        repo.patchStages(LANG, WORD, [
          { stage: enumWordJobStage.fetch_source, status: enumAsyncJobStatus.succeeded },
          { stage: enumWordJobStage.enrich_tiers, status: enumAsyncJobStatus.running },
        ]),
      )
      expect(Exit.isFailure(exit)).toBe(true)

      // fetch_source rolled back to its seeded pending state — nothing committed.
      const fetch = yield* repo.findStages({
        language: LANG,
        word: WORD,
        stage: enumWordJobStage.fetch_source,
      })
      expect(fetch[0]?.status).toBe(enumAsyncJobStatus.pending)
    }),
  )

  it.effect('patchStages on an un-initialized stage fails WordStageNotFoundError', () =>
    Effect.gen(function* () {
      yield* resetDb
      const repo = yield* AsyncWordJobsRepo

      const error = yield* repo
        .patchStages(LANG, WORD, {
          stage: enumWordJobStage.fetch_source,
          status: enumAsyncJobStatus.running,
        })
        .pipe(Effect.flip)
      expect(error).toBeInstanceOf(WordStageNotFoundError)
      if (error instanceof WordStageNotFoundError) {
        expect(error.word).toBe(WORD)
        expect(error.stage).toBe(enumWordJobStage.fetch_source)
      }
    }),
  )
})
