# type-fest — blessed type utilities

**On-demand reference** (not auto-loaded). `type-fest` (catalog `types`, **types-only — zero runtime,
never reaches a bundle**) is the standard library for TS type-level work here. **Before hand-rolling a
mapped/conditional type, check it first** — the readme + the shipped `.d.ts` doc-comments ARE the
source, so no vendored subtree is warranted. Bun doesn't hoist it to the root: read it inside a
consuming workspace (glob `**/node_modules/type-fest`); `test-d/` isn't published — fetch it from
`github.com/sindresorhus/type-fest` for a rare edge case.

- **`Arrayable` — don't use type-fest's.** Theirs is mutable `T | T[]` (deliberate, pending
  microsoft/TypeScript#17002). This repo's single-or-array idiom is readonly: **`Arrayable<T>` from
  `@kotodama/utils`** (`T | readonly T[]`) with its `isArray`/`toArray` companions.
- **Merge-patch payloads:** when a COALESCE upsert treats an explicit `null` as *keep*, the patch type
  must forbid `null` — compose `SetNonNullable<Partial<Row>>` derived off the row (one author) so each
  field is settable-or-omitted, never cleared.
- **type-fest shapes the projection, never a second author** — domain shapes derive from their single
  author (`<Name>Entity`/`<Name>Row` via `Pick`/`Except`, or `effect/Schema` combinators). Schema-land
  transforms stay Schema-level; reach for type-fest only on plain TS types. See `drizzle-effect.md`.
