import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConfigProvider, Effect, type Layer } from 'effect'

// Loads the repo-root `.env` as a FALLBACK under `process.env` — a real exported
// var (and Bun's own `.env` auto-load) wins. Provide it where the `index.ts`
// `Config`s resolve. See @.claude/rules/config.md.

// Repo root by fixed offset from this file's URL, so it is cwd-independent (a
// `bun run --filter … test` runs from the package dir, not the root).
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const readRootFile = (name: string): string => {
  const path = join(repoRoot, name)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

export const ConfigProviderLive: Layer.Layer<never> = ConfigProvider.layerAdd(
  // Deferred so the file is read only when the layer is built.
  Effect.sync(() => ConfigProvider.fromDotEnvContents(readRootFile('.env'))),
)
