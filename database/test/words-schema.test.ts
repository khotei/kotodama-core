import { expect, it } from '@effect/vitest'
import { faker } from '@faker-js/faker'
import { getTableColumns, getTableName, sql, type Table } from 'drizzle-orm'
import { Effect, Result, Schema } from 'effect'
import { makeWordInsert } from '../src/factories'
import {
  DB,
  enumAsyncJobStatus,
  enumLanguage,
  WordEntity,
  WordEntityInsert,
  wordsTable,
} from '../src/index'
import { resetDb, returningOne, TestDatabaseLive } from '../src/testing'

// Runs inside the shared `it.layer` runtime (an `afterEach` would spin a second container).
faker.seed(20260702)

const EN = enumLanguage.en

// The names of every nullable column on `table`, minus `exclude` — read straight off the schema so a
// caller never restates the column list.
const nullableColumnsExcept = <T extends Table>(table: T, ...exclude: string[]) =>
  Object.entries(getTableColumns(table))
    .filter(([name, column]) => !column.notNull && !exclude.includes(name))
    .map(([name]) => name)

// Content = every nullable column except analytics-only `frequency`; adding a content column brings
// it under the checks below for free.
const contentColumns = nullableColumnsExcept(wordsTable, 'frequency')

// Run an insert or a decode and report its outcome, so a test reads as a plain sentence
// (`expect(yield* fails(...)).toBe(true)`) instead of Result-tag plumbing.
const succeeds = (effect: Effect.Effect<unknown, unknown>) =>
  Effect.result(effect).pipe(Effect.map(Result.isSuccess))
const fails = (effect: Effect.Effect<unknown, unknown>) =>
  succeeds(effect).pipe(Effect.map((ok) => !ok))

it.layer(TestDatabaseLive, { timeout: '120 seconds' })((it) => {
  it.effect('words carries a NOT NULL status column and nullable content (AC-1)', () =>
    Effect.gen(function* () {
      yield* resetDb
      const db = yield* DB

      // A pending row with NULL content is legal — status <> 'succeeded' escapes the CHECK.
      const row = yield* returningOne(
        db
          .insert(wordsTable)
          .values({ word: 'lacuna', language: EN, status: enumAsyncJobStatus.pending })
          .returning(),
      )

      expect(row.status).toBe(enumAsyncJobStatus.pending)
      expect(row.coreDefinition).toBeNull()
      expect(row.lexical).toBeNull()
      expect(row.provenance).toBeNull()
    }),
  )

  it.effect('the word_summaries view is gone (AC-1)', () =>
    Effect.gen(function* () {
      const db = yield* DB
      const rows = yield* db.execute<{ oid: string | null }>(
        sql`SELECT to_regclass('public.word_summaries') AS oid`,
      )
      expect(rows[0]?.oid).toBeNull()
    }),
  )

  // A succeeded word must carry every content column. Looping the table's own list proves the CHECK
  // guards EACH one — and a newly-added column is covered here for free.
  it.effect('a succeeded word with any null content column is rejected (AC-3)', () =>
    Effect.gen(function* () {
      yield* resetDb
      const db = yield* DB
      const ready = makeWordInsert({ language: EN, status: enumAsyncJobStatus.succeeded })

      for (const column of contentColumns) {
        // Null one content column; a unique `word` keeps a slip-through from colliding next iteration.
        const withHole = { ...ready, word: column, [column]: null } as typeof ready
        expect(yield* fails(db.insert(wordsTable).values(withHole)), `null ${column}`).toBe(true)
      }
    }),
  )

  // The read shape (`WordEntity`) and write shape (`WordEntityInsert`) are hand-written column→schema
  // maps. Hold both to the same content columns: each is required to READ a ready word, nullable to
  // WRITE one. Drop a column from either map and this fails.
  it.effect(
    'every content column is required to read a ready word, nullable to write one (AC-3)',
    () =>
      Effect.gen(function* () {
        yield* resetDb
        const db = yield* DB
        const ready = yield* returningOne(
          db
            .insert(wordsTable)
            .values(
              makeWordInsert({
                word: 'lacuna',
                language: EN,
                status: enumAsyncJobStatus.succeeded,
              }),
            )
            .returning(),
        )
        expect(
          yield* succeeds(Schema.decodeUnknownEffect(WordEntity)(ready)),
          'a full ready row reads',
        ).toBe(true)

        for (const column of contentColumns) {
          const withHole = { ...ready, [column]: null }
          const read = Schema.decodeUnknownEffect(WordEntity)(withHole)
          const write = Schema.decodeUnknownEffect(WordEntityInsert)(withHole)
          expect(yield* fails(read), `read requires ${column}`).toBe(true)
          expect(yield* succeeds(write), `write allows null ${column}`).toBe(true)
        }
      }),
  )

  it.effect('a succeeded row with full content is accepted (AC-3)', () =>
    Effect.gen(function* () {
      yield* resetDb
      const db = yield* DB

      const [row] = yield* db
        .insert(wordsTable)
        .values(
          makeWordInsert({ word: 'lacuna', language: EN, status: enumAsyncJobStatus.succeeded }),
        )
        .returning()
      expect(row?.status).toBe(enumAsyncJobStatus.succeeded)
      expect(row?.coreDefinition).not.toBeNull()
    }),
  )

  it.effect('the research-locked index set exists on words (AC-2)', () =>
    Effect.gen(function* () {
      const db = yield* DB
      const rows = yield* db.execute<{ indexname: string }>(sql`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = ${getTableName(wordsTable)}
      `)
      const names = rows.map((r) => r.indexname)
      // The research-locked index set (names are the drizzle-generated ones in the schema).
      for (const suffix of [
        'language_created_at_word_idx',
        'language_status_created_at_word_idx',
        'language_pos_created_at_word_idx',
        'trgm_idx',
      ]) {
        expect(names.some((n) => n.includes(suffix))).toBe(true)
      }
    }),
  )
})
