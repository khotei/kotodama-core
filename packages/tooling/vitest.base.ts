import { defineProject } from 'vitest/config'

// Shared Vitest project settings. Every workspace's one-line vitest.config.ts
// re-exports this, so test settings live in ONE place without a central package
// list — the project set is still implied by package.json#workspaces, and each
// workspace is run independently (see root `test` script + .claude/rules/tooling.md).
//
// Why per-package configs at all: on Bun 1.3.10 + Vitest 3.2.4 a single
// `vitest run` over many `projects` is unreliable — it runs only ~9/16 and
// exits 0 even on failure. Running each workspace as its own `vitest run` (via
// `bun run --filter '*' test`) sidesteps that and yields correct per-package
// exit codes, mirroring the `tsc` typecheck design.
export default defineProject({
  test: {
    environment: 'node',
    // Tests live in each workspace's `test/` folder (mirroring `src/`), separate
    // from source — matches the vendored effect-smol/drizzle layout. See
    // `@.claude/rules/testing.md`.
    include: ['test/**/*.test.ts'],
    // Integration tests run against real Testcontainers; a cold first HTTP round-trip (apps/api) can
    // exceed Vitest's 5s default on the slower CI runners. The `it.layer` `{ timeout }` covers only
    // layer build/teardown, not each test — so raise the per-test ceiling here, in one place.
    testTimeout: 30_000,
  },
})
