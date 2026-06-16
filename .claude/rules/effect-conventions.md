---
paths:
  - "**/*.ts"
---

# Effect v4 conventions

**Source of truth:** `repos/effect-smol/` (the vendored v4 beta source). Before writing Effect code, read the relevant `.claude/agent-patterns/*.md` and inspect the real implementation/tests under `repos/effect-smol/`. See `.claude/rules/vendored-sources.md`. (If `repos/effect-smol/LLMS.md` exists upstream, read it first; do not invent it.)

## Core idioms

- **Schema, not Zod.** Use `effect/Schema` for all domain types. Word shapes are authored in `database/` (content schemas + `WordEntity`, via `createSelectSchema` + jsonb overrides); `core/` consumes them directly and authors only computed read models (`WordStateModel`). See `.claude/rules/drizzle-effect.md`.
- **`Context.Service` / `Context.Tag`** for dependency injection (v4 renamed these back from `ServiceMap` during the beta). See `.claude/agent-patterns/effect-context-and-layer.md`.
- **`Layer`** for wiring services. Compose at the app entrypoint; never construct dependencies inside use cases.
- **In-beta APIs live under `effect/unstable/*`** — notably parts of `HttpApi`. Import from there, not a guessed stable path. See `.claude/agent-patterns/effect-httpapi.md`.
- **Errors:** tag with `Data.TaggedError`; handle with `Effect.catchTag` / `Effect.catchTags`. See `.claude/agent-patterns/effect-errors.md`.
- **Config:** build from `effect/Config` (`Config.string`, `Config.redacted` for secrets, `Config.all`). `@lexiai/config` owns `AppConfig`. Configs are yieldable in `Effect.gen`.
- **SQL / DB:** go through Drizzle's first-party Effect integration `drizzle-orm/effect-postgres` (`PgDrizzle` DB layer over `@effect/sql-pg`). The `effect-schema` row derivation is retired here — repos return `$inferSelect` rows; runtime validation of untrusted writes decodes through the database **entity** schemas (`WordEntityInsert`, `createSelectSchema` + jsonb overrides — see `.claude/rules/drizzle-effect.md`). Cheat-sheet `.claude/agent-patterns/drizzle-effect.md`.
- **Entrypoints:** `BunRuntime.runMain(program)` from `@effect/platform-bun`.

## Avoid

- Guessing v4 APIs from v3 docs or training memory — the beta moved (ServiceMap→Context, Schema consolidation, HttpApi reshape). Check `repos/effect-smol/`.
- Importing from `repos/` in application code — keep importing the published `effect` / `@effect/*` packages.
