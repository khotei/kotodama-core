import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { DB, wordsTable } from './index'
import { resetDb, TestDatabaseLive } from './testing'

/**
 * Round-trips words through the Effect `DB` layer against an **ephemeral
 * Testcontainers Postgres** (started + migrated at layer build; see testing.ts).
 * One container for the whole file; `resetDb` at the top of each test isolates
 * state — it runs inside the shared `it.layer` runtime, where an `afterEach`
 * hook can't reach (and would otherwise spin up a second container). Needs a
 * Docker daemon; the layer build timeout covers a first-time image pull.
 */
it.layer(TestDatabaseLive, { timeout: '120 seconds' })((it) => {
  it.effect('inserts and reads back a words row through the DB layer', () =>
    Effect.gen(function* () {
      yield* resetDb
      const db = yield* DB

      yield* db.insert(wordsTable).values({
        term: 'serendipity',
        locale: 'en',
        status: 'ready',
        explanation: 'a happy accident',
      })

      const rows = yield* db.select().from(wordsTable)

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        term: 'serendipity',
        locale: 'en',
        status: 'ready',
        explanation: 'a happy accident',
        readyAt: null,
      })
      // DB-side defaults applied through the layer.
      expect(typeof rows[0]?.id).toBe('string')
      expect(rows[0]?.createdAt).toBeInstanceOf(Date)
    }),
  )

  it.effect('starts from an empty table (the reset isolates tests)', () =>
    Effect.gen(function* () {
      yield* resetDb
      const db = yield* DB

      const before = yield* db.select().from(wordsTable)
      expect(before).toHaveLength(0)

      yield* db.insert(wordsTable).values({ term: 'ephemeral', status: 'pending' })
      const after = yield* db.select().from(wordsTable)
      expect(after).toHaveLength(1)
      // `pending` rows legitimately have null content (the lifecycle invariant).
      expect(after[0]).toMatchObject({ status: 'pending', explanation: null })
    }),
  )
})
