---
paths:
  - "**/*.ts"
---

# Vendored sources (`repos/`)

External library source is vendored under `repos/` (via `git subtree --squash`) so agents read
real implementation patterns instead of guessing from training memory or stale web docs.

- `repos/effect-smol/` — **Effect v4 beta** source, the canonical truth for v4 APIs. For anything
  non-trivial, `repos/effect-smol/LLMS.md` is the maintainers' own LLM-coding guide
  (`MIGRATION.md` and `packages/effect/SCHEMA.md` cover the v3→v4 moves).
- `repos/drizzle/` — Drizzle ORM pinned to the **`1.0.0-rc` tag line** (its `effect-schema` /
  `effect-postgres` integrations are native Effect v4; the `beta.*` line is Effect v3 — never use
  it, and never vendor `main`, which is stable `0.45.x` with no Effect entrypoints). Vendored
  whole, so all dialects are greppable — Kotodama is Postgres-only via the two Effect entrypoints
  under `drizzle-orm/src/{effect-schema,effect-postgres}`; real examples live in
  `integration-tests/tests/pg/`.

## The four rules

1. **Read-only reference** — use `repos/` when working with the related library.
2. **Prefer the vendored source** over guesses or web search for any API shape or idiom.
3. **Never edit** files under `repos/` unless explicitly asked.
4. **Never import** from `repos/` in application code — keep importing the published packages
   (fails Biome lint by design).

Cross-reference the project-local cheat sheets in `.claude/agent-patterns/` (`effect-stdlib`,
`effect-schema`, `effect-context-and-layer`, `effect-httpapi`, `effect-errors`,
`drizzle-effect`) before diving into the tree.

**Updating:** `bun run vendor:effect:update` / `vendor:drizzle:update` pull upstream as one
squashed commit — review like a dependency bump, then `bun run check` + `bun run test`. Bumping
Drizzle = editing both `vendor:drizzle:*` scripts to a newer `1.0.0-rc` tag. `repos/` is excluded
from CI/lint/tsc/vitest and from IDE indexing (`.idea/*.iml` `<excludeFolder>`).
