# Dependency hierarchy (the rule the scaffolding protects)

Allowed direction: **apps → use-cases → core → repositories → database**, and **everything →
packages**. Never the reverse. `packages/*` are leaves — they import nothing internal.
**`use-cases/`** is the top application tier below `apps/*`: user-flow composer functions that
aggregate `core/*` + repo functions into one end-to-end flow an app binds — nothing below may
import upward into it. **`database/` is the bottom of the chain and authors the word vocabulary**
(content effect-schemas, value tuples/`pgEnum`s, the `WordEntity` row schema); `use-cases → database`,
`core → database` and `apps → database` are legal downward edges, so the word shapes are
single-authored without a cycle.

```
apps/{api,worker} ─► use-cases/* ─► core/* ─► repositories/* ─► database/   (database authors vocabulary + WordEntity)
                                      │  ▲ use-cases/core/apps consume WordEntity/WordRow directly
                                      ▼
                                  packages/{ai,queue,storage,config,observability}
                                  (everything → packages, packages → nothing internal)
```

**Enforcement:** Biome `style/noRestrictedImports` per-glob overrides (`biome.json`) fail lint on a
forbidden import — Biome is the sole enforcement (the per-package `tsconfig` `references` that once
also constrained edges are gone). Run `/scan-deps` to check.
