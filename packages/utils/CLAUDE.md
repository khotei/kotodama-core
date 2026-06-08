# packages/utils — `@lexiai/utils`

Shared **dependency-free, generic** TypeScript helpers — no Effect, no drizzle, no domain types. A pure
leaf: imports nothing internal, importable by any layer.

- **`isReadonlyArray` / `toArray`** — the single-or-array normalizers used by repo query/write builders
  (`WordsRepo`, `AsyncWordJobsRepo`) so a filter or batch input can be a value or an array. The typed
  guard exists because the built-in `Array.isArray` widens a `T | readonly T[]` union to `any[]`.
- **Boundary:** keep it dependency-free. Anything needing `effect`/domain types belongs in the layer
  that owns it, not here.
