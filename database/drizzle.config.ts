import { ConfigProviderLive, DatabaseUrl } from '@lexiai/config'
import { defineConfig } from 'drizzle-kit'
import { Effect, Redacted } from 'effect'

/**
 * `drizzle-kit` is a plain CLI, not an Effect runtime, so it can't yield a
 * `Config`. We still route the URL through `@lexiai/config` (the single env
 * owner — `@.claude/rules/config.md`): resolve `DatabaseUrl` against
 * `ConfigProviderLive` (repo-root `.env`, `process.env` wins) with `runSync`.
 * Override the target DB for one command with an exported `DATABASE_URL`.
 * (These migrate the dev DB; tests migrate their own ephemeral container.)
 */
const databaseUrl = Redacted.value(Effect.runSync(Effect.provide(DatabaseUrl, ConfigProviderLive)))

export default defineConfig({
  dialect: 'postgresql',
  // Single barrel entry, not the './schema' directory: globbing the dir loads
  // both words.table.ts and index.ts (which re-exports it), making drizzle-kit
  // see every table twice. The barrel re-exports each table exactly once.
  schema: './schema/index.ts',
  out: './migrations',
  dbCredentials: { url: databaseUrl },
})
