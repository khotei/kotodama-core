# Vendored sources (`repos/`)

This project vendors external library source under `repos/` so Claude Code (Desktop & CLI) can read real implementation patterns the same way it reads application code — instead of guessing from training memory or fragmented web docs. This is the **single rule surface** for vendored repos (Claude-Code-specific; there is no `AGENTS.md`).

## Inventory

- `repos/effect-smol/` — Effect **v4 beta** source (the canonical source of truth for v4 APIs). Vendored via `git subtree --squash`; present at HEAD after a fresh clone (no init step).

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

## Updating

`bun run vendor:effect:update` pulls upstream as a single squashed commit; review the squashed diff like a dependency bump and re-run `bun run check` + `bun run test`.

## Editor noise

`repos/` is excluded from JetBrains IntelliJ indexing/search/auto-import via `.idea/*.iml` `<excludeFolder>`, and (optionally) from VSCode via `.vscode/settings.json`. See T16's outcome and the readme "Editor setup" note. CI/lint/tsc/vitest also skip `repos/**`.
