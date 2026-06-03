import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PgClient } from '@effect/sql-pg'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/effect-postgres/migrator'
import { Context, Data, Effect, Layer, Redacted } from 'effect'
import { Wait } from 'testcontainers'
import { DB, DBLive } from './db'

/**
 * Test helpers for `@lexiai/database` (subpath `@lexiai/database/testing`).
 *
 * Tests run against an **ephemeral Postgres started by Testcontainers**, never a
 * shared/long-lived DB. The connection URL is generated per container, so a test
 * run structurally cannot touch the dev DB — there is no `.env.test` and no
 * test-mode config precedence to get wrong. Mirrors Effect's own pg tests
 * (`repos/effect-smol/packages/sql/pg/test/utils.ts`). Requires a Docker daemon.
 */

// Migrations live at `database/migrations`, resolved from this file's location
// (not `cwd`: `bun run --filter … test` runs from the package dir, but keep it
// offset-based to stay robust). `migrate` reads the drizzle-kit rc folder format
// (`<timestamp>_*/migration.sql`, sorted by name) — no `_journal.json`.
const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

class ContainerError extends Data.TaggedError('ContainerError')<{ cause: unknown }> {}

/**
 * Scoped throwaway Postgres container: started on layer build, stopped when the
 * layer's scope closes (end of the test file). Pinned to the dev image tag so
 * tests and dev run the same Postgres.
 */
class PgContainer extends Context.Service<PgContainer>()('@lexiai/database/testing/PgContainer', {
  make: Effect.acquireRelease(
    Effect.tryPromise({
      // Override the module default `forAll(forHealthCheck, forListeningPorts)`:
      // `forListeningPorts` runs an in-container `exec` probe that HANGS on Docker
      // Desktop/macOS (the exec stream never resolves), so `.start()` blocks until
      // the 120s startup timeout. The pg_isready healthcheck the module already
      // installs is polled via Docker's native health status (no exec) and is a
      // truer DB-readiness signal — wait on that alone.
      try: () =>
        new PostgreSqlContainer('postgres:16-alpine')
          .withWaitStrategy(Wait.forHealthCheck())
          .start(),
      catch: (cause) => new ContainerError({ cause }),
    }),
    (container) => Effect.promise(() => container.stop()),
  ),
}) {
  static readonly layer = Layer.effect(this)(this.make)
}

// PgClient over the container's generated URI — NOT @lexiai/config's DatabaseUrl
// (that is the dev DB; tests must hit the ephemeral one).
const PgClientLive = Layer.unwrap(
  Effect.gen(function* () {
    const container = yield* PgContainer
    return PgClient.layer({ url: Redacted.make(container.getConnectionUri()) })
  }),
).pipe(Layer.provide(PgContainer.layer))

/**
 * `DB` over a fresh container with migrations **already applied**. A new
 * container boots empty, so `migrate` runs once at layer-build time. Use with
 * `it.layer(TestDatabaseLive)` — one container per test file. The migration
 * record lives in the `drizzle` schema, so `resetDb` (public-only) leaves it
 * intact and migration is not re-run.
 */
export const TestDatabaseLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const db = yield* DB
    yield* migrate(db, { migrationsFolder })
  }),
).pipe(Layer.provideMerge(DBLive), Layer.provide(PgClientLive))

/**
 * `TRUNCATE` every `public` table (`RESTART IDENTITY CASCADE`), enumerated from
 * `pg_tables` — no per-table list. `quote_ident` handles kebab-case names;
 * `CASCADE` sidesteps FK order. Run it at the **start of each test** to isolate
 * state: the `it.layer` container is shared across the file, so reset must run
 * in that runtime — an `afterEach` hook providing its own layer would spin up a
 * second container.
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
