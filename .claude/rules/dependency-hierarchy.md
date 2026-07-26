# Dependency hierarchy (the boundary the scaffolding protects)

Allowed direction — never the reverse:

    apps/{api,worker} → core/use-cases → core/{words,content} → core/repositories → database
    everything → platform   (platform → nothing internal)

- **`core` and `platform` are each ONE aggregate package**, layers/adapters exposed as subpaths
  (`@kotodama/core/{use-cases,words,content,repositories}`, `@kotodama/platform/*`) — a new domain is
  a folder, never a new package. `use-cases/` = top-tier user-flow composers.
- **`database` is its own `@kotodama/database` workspace** (bottom of chain) — its
  drizzle-kit/migration/Testcontainers apparatus earns the boundary. It single-authors the word
  vocabulary (content schemas, value tuples/`pgEnum`s, `WordEntity`), so `use-cases`, `words`,
  `content`, and `apps` all take a **direct downward edge to `database`** — no cycle.
- `platform/*` are leaf adapters importing nothing internal.

Enforcement: Biome `noRestrictedImports` per-folder globs in `biome.base.json` are the sole gate.
Run `/scan-deps`.
