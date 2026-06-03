import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConfigProvider, Effect, type Layer } from 'effect'

/**
 * Installs a `ConfigProvider` that loads the repo-root `.env` as a **fallback
 * under `process.env`** — a real exported variable (and Bun's own `.env`
 * auto-load) wins; the dotenv just guarantees `.env` is read under any runtime.
 *
 * Provide it where the `Config`s in `index.ts` resolve: app entrypoints and
 * non-Effect CLIs (`drizzle.config.ts` resolves one value through it). See
 * `@.claude/rules/config.md`.
 *
 * DB **tests do not use this** — they run against an ephemeral Testcontainers
 * Postgres with a generated URL (`@lexiai/database/testing`), so there is no
 * `.env.test` and no test-mode precedence to manage.
 */

// This file lives at `packages/config/src/`, so the repository root is a fixed
// three levels up — pointed at directly, not searched for. Derived from this
// file's own URL, so it is independent of the process `cwd` (a filtered
// `bun run --filter … test` runs from the package directory, not the root).
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const readRootFile = (name: string): string => {
  const path = join(repoRoot, name)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

export const ConfigProviderLive: Layer.Layer<never> = ConfigProvider.layerAdd(
  // Deferred to layer-build time so the file is read only when the layer is used.
  Effect.sync(() => ConfigProvider.fromDotEnvContents(readRootFile('.env'))),
)
