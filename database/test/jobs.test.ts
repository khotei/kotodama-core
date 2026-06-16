import { expect, it } from '@effect/vitest'
import { faker } from '@faker-js/faker'
import { and, eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { makeAsyncWordJobInsert } from '../src/factories'
import {
  asyncWordJobsTable,
  DB,
  enumAsyncJobStatus,
  enumLanguage,
  enumWordJobStage,
  wordJobStage,
} from '../src/index'
import { resetDb, TestDatabaseLive } from '../src/testing'

faker.seed(20260604)

const seedStages = (word: string) =>
  wordJobStage.enumValues.map((stage) =>
    makeAsyncWordJobInsert({ word, language: enumLanguage.en, stage }),
  )

it.layer(TestDatabaseLive, { timeout: '120 seconds' })((it) => {
  it.effect('a generation is one async_word_jobs row per stage, all pending', () =>
    Effect.gen(function* () {
      yield* resetDb
      const db = yield* DB

      yield* db.insert(asyncWordJobsTable).values(seedStages('lacuna'))

      const rows = yield* db
        .select()
        .from(asyncWordJobsTable)
        .where(eq(asyncWordJobsTable.word, 'lacuna'))

      // One row per pipeline stage (unordered — no query sorts by stage).
      expect(rows).toHaveLength(wordJobStage.enumValues.length)
      expect(new Set(rows.map((r) => r.stage))).toEqual(new Set(wordJobStage.enumValues))
      expect(wordJobStage.enumValues[0]).toBe(enumWordJobStage.fetch_source)
      expect(rows.every((r) => r.status === enumAsyncJobStatus.pending)).toBe(true)
      // The word subject lives in columns, not a payload.
      expect(rows[0]).not.toHaveProperty('payload')
    }),
  )

  it.effect('async_word_jobs_stage_uq: at most one row per (word, language, stage)', () =>
    Effect.gen(function* () {
      yield* resetDb
      const db = yield* DB
      const dupStage = makeAsyncWordJobInsert({
        word: 'lacuna',
        language: enumLanguage.en,
        stage: enumWordJobStage.fetch_source,
      })

      yield* db.insert(asyncWordJobsTable).values(dupStage)

      const dup = yield* db.insert(asyncWordJobsTable).values(dupStage).pipe(Effect.exit)
      expect(dup._tag).toBe('Failure')

      // A different stage of the same word is fine.
      yield* db.insert(asyncWordJobsTable).values(
        makeAsyncWordJobInsert({
          word: 'lacuna',
          language: enumLanguage.en,
          stage: enumWordJobStage.final_review,
        }),
      )
      expect(yield* db.select().from(asyncWordJobsTable)).toHaveLength(2)
    }),
  )

  it.effect('onConflictDoUpdate resets a stage in place (the regen path)', () =>
    Effect.gen(function* () {
      yield* resetDb
      const db = yield* DB
      const stage = makeAsyncWordJobInsert({
        word: 'lacuna',
        language: enumLanguage.en,
        stage: enumWordJobStage.fetch_source,
      })

      const [first] = yield* db
        .insert(asyncWordJobsTable)
        .values({ ...stage, status: enumAsyncJobStatus.succeeded, result: { note: 'done' } })
        .returning()
      if (!first) throw new Error('insert returned no row')

      const [reset] = yield* db
        .insert(asyncWordJobsTable)
        .values(stage)
        .onConflictDoUpdate({
          target: [asyncWordJobsTable.word, asyncWordJobsTable.language, asyncWordJobsTable.stage],
          set: { status: enumAsyncJobStatus.pending, result: null },
        })
        .returning()

      // Same row, reset — no second row, no history.
      expect(reset?.id).toBe(first.id)
      expect(reset?.status).toBe(enumAsyncJobStatus.pending)
      expect(reset?.result).toBeNull()
      expect(
        yield* db
          .select()
          .from(asyncWordJobsTable)
          .where(
            and(
              eq(asyncWordJobsTable.word, 'lacuna'),
              eq(asyncWordJobsTable.stage, enumWordJobStage.fetch_source),
            ),
          ),
      ).toHaveLength(1)
    }),
  )
})
