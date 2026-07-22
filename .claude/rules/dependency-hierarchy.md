# Dependency hierarchy (the rule the scaffolding protects)

Allowed direction: **apps → use-cases → core → repositories → database**, and **everything →
platform**. Never the reverse. The domain tiers are **layer folders inside the single `@kotodama/core` package**
(subpath-exported: `@kotodama/core/{use-cases,words,content,repositories}`); **`database` is its own
bottom-of-chain `@kotodama/database` workspace** — its drizzle-kit/migration/Testcontainers/faker
apparatus is distinct enough to earn a package boundary; `platform/*` are the adapter folders of the
single leaf package `@kotodama/platform` — they import nothing internal. **`core/use-cases/`** is the top application tier below `apps/*`: user-flow composer
functions that aggregate the core-domain (`words`/`content`) + repo functions into one end-to-end flow
an app binds — nothing below may import upward into it. **`database/` is the bottom of the chain
and authors the word vocabulary** (content effect-schemas, value tuples/`pgEnum`s, the `WordEntity` row
schema); `use-cases → database`, `words/content → database` and `apps → database` are legal downward
edges, so the word shapes are single-authored without a cycle.

```
apps/{api,worker} ─► core/use-cases ─► core/{words,content} ─► core/repositories ─► database
                                            │  ▲ use-cases/domain/apps consume WordEntity/WordRow directly
                                            ▼
                                    platform/{ai,queue,storage,config,external-apis,observability}
                                    (everything → @kotodama/platform, platform → nothing internal)
```

**Enforcement:** Biome `style/noRestrictedImports` per-**folder**-glob overrides in
`.tooling/biome.base.json` fail lint on a forbidden import — each override matches a layer folder
(`database/**`, `core/repositories/**`, `core/words|content/**`, `core/use-cases/**`,
`platform/**`) and bans the `@kotodama/core/*` subpath specifiers above it (e.g. `database/**`
may not import `@kotodama/core/{words,content,repositories,use-cases}`; `platform/**` may not import
`@kotodama/core/*` or `@kotodama/app-*`). Biome is the sole enforcement (the per-package `tsconfig`
`references` that once also constrained edges are gone). Run `/scan-deps` to check.
