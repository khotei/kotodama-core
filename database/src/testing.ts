import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PgClient } from '@effect/sql-pg'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/effect-postgres/migrator'
import { Context, Data, Effect, Layer, Redacted } from 'effect'
import { Wait } from 'testcontainers'
import { DB, DBLive } from './db'

class ContainerError extends Data.TaggedError('ContainerError')<{ cause: unknown }> {}

// Resolved from this file's location, not `cwd`, to stay robust to the invoking dir.
const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

class PgContainer extends Context.Service<PgContainer>()('@kotodama/database/testing/PgContainer', {
  make: Effect.acquireRelease(
    Effect.tryPromise({
      // Wait on the healthcheck alone, overriding the module default that also runs
      // `forListeningPorts`: its in-container `exec` probe HANGS on Docker Desktop/macOS,
      // blocking `.start()` until the 120s timeout.
      try: () =>
        new PostgreSqlContainer('postgres:16-alpine')
          .withWaitStrategy(Wait.forHealthCheck())
          // Data dir on tmpfs (RAM): migrate + per-test TRUNCATE never hit real disk, so fsync
          // durability costs nothing. The container is ephemeral, so losing it on stop is the point.
          .withTmpFs({ '/var/lib/postgresql/data': 'rw' })
          .start(),
      catch: (cause) => new ContainerError({ cause }),
    }),
    (container) => Effect.promise(() => container.stop()),
  ),
}) {
  static readonly layer = Layer.effect(this)(this.make)
}

// Container's generated URI, NOT @kotodama/config's DatabaseUrl (the dev DB).
const PgClientLive = Layer.unwrap(
  Effect.gen(function* () {
    const container = yield* PgContainer
    return PgClient.layer({ url: Redacted.make(container.getConnectionUri()) })
  }),
).pipe(Layer.provide(PgContainer.layer))

/**
 * `DB` with migrations applied at layer build. One container per test file via
 * `it.layer(TestDatabaseLive)`. The migration record lives in the `drizzle` schema,
 * so `resetDb` (public-only) leaves it intact.
 */
export const TestDatabaseLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const db = yield* DB
    yield* migrate(db, { migrationsFolder })
  }),
).pipe(Layer.provideMerge(DBLive), Layer.provide(PgClientLive))

/**
 * Run at the START of each test, not in an `afterEach`: the `it.layer` container is
 * shared across the file, so a hook providing its own layer spins up a second container.
 */
export const resetDb = Effect.gen(function* () {
  const db = yield* DB
  yield* db.execute(sql`
    DO $$
    DECLARE stmt text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(quote_ident(tablename), ', ') || ' RESTART IDENTITY CASCADE'
        INTO stmt
      FROM pg_tables WHERE schemaname = 'public';
      IF stmt IS NOT NULL THEN EXECUTE stmt; END IF;
    END $$;
  `)
})
