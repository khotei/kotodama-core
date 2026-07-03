import { ConfigProviderLive, DatabaseUrl } from '@kotodama/config'
import { defineConfig } from 'drizzle-kit'
import { Effect, Redacted } from 'effect'

// drizzle-kit is a plain CLI (no Effect runtime), so resolve `DatabaseUrl` through
// `@kotodama/config` with `runSync`. Override per-command with an exported `DATABASE_URL`.
const databaseUrl = Redacted.value(Effect.runSync(Effect.provide(DatabaseUrl, ConfigProviderLive)))

export default defineConfig({
  dialect: 'postgresql',
  // Single barrel entry, not the './schema' dir: globbing the dir double-counts
  // tables the barrel re-exports.
  schema: './schema/index.ts',
  out: './migrations',
  dbCredentials: { url: databaseUrl },
})
