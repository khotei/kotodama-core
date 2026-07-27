---
paths:
  - "**/*.ts"
---

# Vendored sources (`repos/`)

External library source is vendored under `repos/` (`git subtree --squash`) so agents read real
implementations instead of guessing. **Prefer it over web search or memory; read-only; never edit
unless asked; never import from `repos/` in app code** (fails Biome by design — import the published
packages).

- `repos/effect-smol/` — **Effect v4 beta** source, canonical for v4 APIs. Start at `LLMS.md` (the maintainers' LLM guide); `MIGRATION.md` + `packages/effect/SCHEMA.md` cover the v3→v4 moves.
- `repos/drizzle/` — pinned to the **`1.0.0-rc` tag line**: its `effect-schema`/`effect-postgres` entrypoints are native Effect v4. **Never use the `beta.*` line (Effect v3) or vendor `main` (stable 0.45.x, no Effect entrypoints).** Kotodama is Postgres-only via `drizzle-orm/src/{effect-schema,effect-postgres}`; examples in `integration-tests/tests/pg/`.

Check `.claude/agent-patterns/effect-v4-deltas.md` (and the `drizzle-effect` rule) before diving into the tree.

**Updating:** `bun run vendor:{effect,drizzle}:update` pull upstream as one squashed commit — review
like a dep bump, then `bun run check` + `test`. Bumping Drizzle = edit both `vendor:drizzle:*` scripts
to a newer `1.0.0-rc` tag. `repos/` is excluded from CI/lint/tsc/vitest + IDE indexing.
