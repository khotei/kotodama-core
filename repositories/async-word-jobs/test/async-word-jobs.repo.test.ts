import { describe, expect, it } from '@effect/vitest'
import {
  enumAsyncJobStatus,
  enumJobErrorType,
  enumLanguage,
  enumWordJobStage,
  wordJobStage,
} from '@lexiai/database'
import { resetDb, TestDatabaseLive } from '@lexiai/database/testing'
import { Effect, Layer } from 'effect'
import { AsyncWordJobsRepo, AsyncWordJobsRepoLive, stagePatch } from '../src/index'

const TestLayer = AsyncWordJobsRepoLive.pipe(Layer.provideMerge(TestDatabaseLive))

// Sourced from the pgEnum, not re-listed.
const ALL_STAGES = wordJobStage.enumValues
const LANG = enumLanguage.en
const WORD = 'lacuna'

it.layer(TestLayer, { timeout: '120 seconds' })((it) => {
  describe('AsyncWordJobsRepo.saveStages', () => {
    it.effect('pending patches seed one pending row per planned stage', () =>
      Effect.gen(function* () {
        yield* resetDb
        const repo = yield* AsyncWordJobsRepo

        const rows = yield* repo.saveStages(LANG, WORD, ALL_STAGES.map(stagePatch.pending))
        expect(rows).toHaveLength(ALL_STAGES.length)
        expect(new Set(rows.map((r) => r.stage))).toEqual(new Set(ALL_STAGES))
        expect(rows.every((r) => r.status === enumAsyncJobStatus.pending)).toBe(true)
        expect(rows.every((r) => r.word === WORD && r.language === LANG)).toBe(true)

        // A subset is honoured (the caller plans which stages to run).
        const reset = yield* repo.saveStages(LANG, 'other', [
          stagePatch.pending(enumWordJobStage.fetch_source),
        ])
        expect(reset.map((r) => r.stage)).toEqual([enumWordJobStage.fetch_source])
      }),
    )

    it.effect('pending resets in place: regen returns a generated word to pending', () =>
      Effect.gen(function* () {
        yield* resetDb
        const repo = yield* AsyncWordJobsRepo

        const first = yield* repo.saveStages(
          LANG,
          WORD,
          stagePatch.pending(enumWordJobStage.fetch_source),
        )
        yield* repo.saveStages(LANG, WORD, stagePatch.running(enumWordJobStage.fetch_source))
        yield* repo.saveStages(
          LANG,
          WORD,
          stagePatch.succeeded(enumWordJobStage.fetch_source, { coreDefinition: 'a gap' }),
        )

        // Re-seed (regen) clears the prior outcome on the SAME row — the pending patch's explicit
        // nulls clear every payload column; no second row, no history.
        const again = yield* repo.saveStages(
          LANG,
          WORD,
          stagePatch.pending(enumWordJobStage.fetch_source),
        )
        expect(again.id).toBe(first.id)
        expect(again.status).toBe(enumAsyncJobStatus.pending)
        expect(again.result).toBeNull()
        expect(again.startedAt).toBeNull()
        expect(again.finishedAt).toBeNull()
        expect(yield* repo.findStages({ language: LANG, word: WORD })).toHaveLength(1)
      }),
    )

    it.effect(
      'stagePatch pairing: running stamps startedAt; succeed/fail stamp finishedAt + result/error',
      () =>
        Effect.gen(function* () {
          yield* resetDb
          const repo = yield* AsyncWordJobsRepo
          yield* repo.saveStages(LANG, WORD, ALL_STAGES.map(stagePatch.pending))

          const running = yield* repo.saveStages(
            LANG,
            WORD,
            stagePatch.running(enumWordJobStage.fetch_source),
          )
          expect(running.status).toBe(enumAsyncJobStatus.running)
          expect(running.startedAt).toBeInstanceOf(Date)

          const ok = yield* repo.saveStages(
            LANG,
            WORD,
            stagePatch.succeeded(enumWordJobStage.fetch_source, {
              coreDefinition: 'an unfilled space; a gap',
            }),
          )
          expect(ok.status).toBe(enumAsyncJobStatus.succeeded)
          expect(ok.finishedAt).toBeInstanceOf(Date)
          expect(ok.result).toEqual({ coreDefinition: 'an unfilled space; a gap' })
          // Merge-patch: the succeeded patch doesn't carry startedAt, so running's stamp survives.
          expect(ok.startedAt).toEqual(running.startedAt)

          const bad = yield* repo.saveStages(
            LANG,
            WORD,
            stagePatch.failed(enumWordJobStage.enrich_visuals, {
              message: 'image gen failed',
              type: enumJobErrorType.failed,
            }),
          )
          expect(bad.status).toBe(enumAsyncJobStatus.failed)
          expect(bad.error?.message).toBe('image gen failed')
          expect(bad.error?.type).toBe(enumJobErrorType.failed)
        }),
    )

    it.effect('(array): a mixed batch saves each patch with its own payload', () =>
      Effect.gen(function* () {
        yield* resetDb
        const repo = yield* AsyncWordJobsRepo
        yield* repo.saveStages(LANG, WORD, ALL_STAGES.map(stagePatch.pending))

        const rows = yield* repo.saveStages(LANG, WORD, [
          stagePatch.succeeded(enumWordJobStage.fetch_source, { coreDefinition: 'a gap' }),
          stagePatch.running(enumWordJobStage.enrich_tiers),
          stagePatch.failed(enumWordJobStage.enrich_visuals, {
            message: 'image gen failed',
            type: enumJobErrorType.failed,
          }),
        ])
        expect(rows).toHaveLength(3)

        const byStage = new Map(rows.map((row) => [row.stage, row]))
        expect(byStage.get(enumWordJobStage.fetch_source)?.status).toBe(
          enumAsyncJobStatus.succeeded,
        )
        expect(byStage.get(enumWordJobStage.fetch_source)?.result).toEqual({
          coreDefinition: 'a gap',
        })
        expect(byStage.get(enumWordJobStage.enrich_tiers)?.status).toBe(enumAsyncJobStatus.running)
        expect(byStage.get(enumWordJobStage.enrich_tiers)?.startedAt).toBeInstanceOf(Date)
        expect(byStage.get(enumWordJobStage.enrich_visuals)?.status).toBe(enumAsyncJobStatus.failed)
        expect(byStage.get(enumWordJobStage.enrich_visuals)?.error?.message).toBe(
          'image gen failed',
        )

        // untouched stages stay pending.
        const pending = yield* repo.findStages({
          language: LANG,
          word: WORD,
          status: enumAsyncJobStatus.pending,
        })
        expect(pending).toHaveLength(ALL_STAGES.length - 3)
      }),
    )

    it.effect('on a never-initialized stage creates the row (save semantics)', () =>
      Effect.gen(function* () {
        yield* resetDb
        const repo = yield* AsyncWordJobsRepo

        const saved = yield* repo.saveStages(
          LANG,
          WORD,
          stagePatch.running(enumWordJobStage.fetch_source),
        )
        expect(saved.status).toBe(enumAsyncJobStatus.running)
        expect(yield* repo.findStages({ language: LANG, word: WORD })).toHaveLength(1)
      }),
    )
  })

  describe('AsyncWordJobsRepo.findStages', () => {
    it.effect('scoped read; stage/status take a value or an array', () =>
      Effect.gen(function* () {
        yield* resetDb
        const repo = yield* AsyncWordJobsRepo
        yield* repo.saveStages(LANG, WORD, ALL_STAGES.map(stagePatch.pending))

        // all the word's stages (unordered).
        const all = yield* repo.findStages({ language: LANG, word: WORD })
        expect(all).toHaveLength(ALL_STAGES.length)
        expect(new Set(all.map((r) => r.stage))).toEqual(new Set(ALL_STAGES))

        // scoped to (word, language): another word is invisible.
        expect(yield* repo.findStages({ language: LANG, word: 'absent' })).toHaveLength(0)

        yield* repo.saveStages(LANG, WORD, stagePatch.running(enumWordJobStage.fetch_source))
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
  })
})
