# Vendored sources (`repos/`)

This project vendors external library source under `repos/` so Claude Code (Desktop & CLI) can read real implementation patterns the same way it reads application code — instead of guessing from training memory or fragmented web docs. This is the **single rule surface** for vendored repos (Claude-Code-specific; there is no `AGENTS.md`).

## Inventory

- `repos/effect-smol/` — Effect **v4 beta** source (the canonical source of truth for v4 APIs). Vendored via `git subtree --squash`; present at HEAD after a fresh clone (no init step).
- `repos/drizzle/` — **Drizzle ORM** source, pinned to tag **`v1.0.0-rc.3`** (the `1.0.0-rc` line — its `effect-schema` / `effect-postgres` integrations are **native Effect v4 beta**, matching `effect@4.0.0-beta.74`; the `beta.15`–`beta.21` line is Effect **v3** and must not be used). The canonical source of truth for how LexiAI talks to Postgres. Vendored via `git subtree --squash` (`bun run vendor:drizzle:add` / `vendor:drizzle:update`); present at HEAD after a fresh clone (no init step). **Vendored whole — not pruned**, so the full upstream monorepo (all dialects, drizzle-kit, integration-tests) is greppable. **Version lead (not drift):** the vendored ref (`1.0-rc`) deliberately *leads* catalog `db` (still `drizzle-orm@^0.38`); the catalog bump + `DBLive` wiring is the downstream `database/` feature.

## The four rules

1. **Read-only reference.** Use `repos/` as read-only reference material when working with the related library.
2. **Prefer the vendored source** over guesses, prior-training memory, or web search when you need an API shape, idiom, or example.
3. **Do not edit** files under `repos/` unless explicitly asked.
4. **Do not import** from `repos/` in application code. Application code keeps importing the published packages (`effect`, `@effect/platform-bun`, …). Importing from `repos/` fails Biome lint by design.

## Writing Effect code

- Inspect `repos/effect-smol/` for idiomatic usage, tests, module structure, and API design — treat it as the source of truth for Effect patterns.
- **Read `repos/effect-smol/LLMS.md` first** — it is present upstream and is the maintainers' own LLM-coding guide. (`repos/effect-smol/MIGRATION.md` and `packages/effect/SCHEMA.md` cover the v3→v4 and Schema migrations.)
- Cross-reference the project-local cheat sheets in `.claude/agent-patterns/`:
  - `.claude/agent-patterns/effect-schema.md`
  - `.claude/agent-patterns/effect-context-and-layer.md`
  - `.claude/agent-patterns/effect-httpapi.md`
  - `.claude/agent-patterns/effect-errors.md`

## Writing Drizzle code

- Inspect `repos/drizzle/` for real Postgres patterns instead of guessing from web docs (which still show the **Effect v3** examples — `@effect/sql-drizzle`, `Context.Tag`). The vendored `rc` source is authoritative over `orm.drizzle.team`.
- **The two first-party Effect integrations are the point** — grep them under `repos/drizzle/drizzle-orm/src/`:
  - `effect-schema/` — `createSelectSchema` / `createInsertSchema` / `createUpdateSchema` (derive `effect/Schema` from a `pgTable`).
  - `effect-postgres/` — `PgDrizzle.make` / `makeWithDefaults`, `EffectLogger` (an Effect-native DB layer over `@effect/sql-pg`).
  - their helpers: `effect-core/`, `cache/`, plus `pg-core/` (column types, `pgTable`, relations) and `up-migrations/`.
- **Grep it for:** Postgres column types, `pgTable`, `createSelectSchema` / `createInsertSchema`, `PgDrizzle.make`, relations, migration generation (`drizzle-kit/`), and the **Postgres integration-tests** (`repos/drizzle/integration-tests/tests/pg/`, `…/validators/effect-schema/pg.test.ts`) for real schema/relations/migration examples.
- **There is no Drizzle `LLMS.md`** (unlike effect-smol). The entry point is `.claude/agent-patterns/drizzle-effect.md`; the *mandate* for how LexiAI uses Drizzle is `.claude/rules/drizzle-effect.md`.
- **Do not** import from `repos/`; execution goes through the `effect-postgres` layer, **never** a bare `drizzle-orm/node-postgres` driver or a hand-rolled `PgClient`. The tree is vendored whole, so non-pg dialects and bare drivers are also present — ignore them; LexiAI is Postgres-only via the two Effect entrypoints.

## Updating

`bun run vendor:effect:update` pulls Effect upstream as a single squashed commit; review the squashed diff like a dependency bump and re-run `bun run check` + `bun run test`.

`bun run vendor:drizzle:update` does the same for Drizzle, pinned to the same `1.0.0-rc` tag as `vendor:drizzle:add`. Because the vendor is kept **whole**, there is no re-prune step — just review the squashed diff and re-run `bun run check` + `bun run test`. Bumping = deliberately editing both `vendor:drizzle:*` scripts to a newer `1.0.0-rc` tag (never `main` — upstream `main` is stable `0.45.x` with no Effect entrypoints; never a `beta` tag — Effect v3).

## Editor noise

`repos/` is excluded from JetBrains IntelliJ indexing/search/auto-import via `.idea/*.iml` `<excludeFolder>`, and (optionally) from VSCode via `.vscode/settings.json`. See T16's outcome and the readme "Editor setup" note. CI/lint/tsc/vitest also skip `repos/**`.
