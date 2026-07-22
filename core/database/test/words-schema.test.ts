import { expect, it } from '@effect/vitest'
import { faker } from '@faker-js/faker'
import { getTableName, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import { makeWordInsert } from '../src/factories'
import { DB, enumAsyncJobStatus, enumLanguage, wordsTable } from '../src/index'
import { resetDb, TestDatabaseLive } from '../src/testing'

// Runs inside the shared `it.layer` runtime (an `afterEach` would spin a second container).
faker.seed(20260702)

const EN = enumLanguage.en

it.layer(TestDatabaseLive, { timeout: '120 seconds' })((it) => {
  it.effect('words carries a NOT NULL status column and nullable content (AC-1)', () =>
    Effect.gen(function* () {
      yield* resetDb
      const db = yield* DB

      // A pending row with NULL content is legal — status <> 'succeeded' escapes the CHECK.
      const [row] = yield* db
        .insert(wordsTable)
        .values({ word: 'lacuna', language: EN, status: enumAsyncJobStatus.pending })
        .returning()
      if (!row) throw new Error('insert returned no row')

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

  it.effect('the CHECK rejects a succeeded row with any NULL content column (AC-3)', () =>
    Effect.gen(function* () {
      yield* resetDb
      const db = yield* DB

      const full = makeWordInsert({ word: 'lacuna', language: EN })
      const { coreDefinition: _c, ...missingCore } = full

      const result = yield* Effect.result(
        db.insert(wordsTable).values({ ...missingCore, status: enumAsyncJobStatus.succeeded }),
      )
      expect(result._tag).toBe('Failure')
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
