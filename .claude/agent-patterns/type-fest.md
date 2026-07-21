# type-fest — blessed type utilities

**On-demand reference** (not auto-loaded). `type-fest` (catalog `types`, **types-only — zero runtime,
never reaches a bundle**) is the standard library for TS type-level work here. **Before hand-rolling a
mapped/conditional type, check it first**: the readme documents every utility, and the shipped `.d.ts`
*is* the source — the npm tarball carries `readme.md` + all `source/*.d.ts` **with their full doc
comments and `@example` blocks**, so no vendored subtree is warranted (unlike effect-smol/drizzle,
where the published artifact/docs and the real source diverge). Bun does not hoist it to the root:
read it inside a consuming workspace, e.g.
`repositories/async-word-jobs/node_modules/type-fest/{readme.md,source/*.d.ts}` (or glob
`**/node_modules/type-fest`). The repo's `test-d/` type-assertions are **not** published — for a rare
edge-case question, fetch `github.com/sindresorhus/type-fest/blob/main/test-d/<utility>.ts` directly.

## Blessed utilities (the ones this repo reaches for)

| Utility | Use for |
|---|---|
| `SetNonNullable<T, K?>` | strip `null`/`undefined` from chosen keys' **values** (keeps `?`) |
| `SetOptional<T, K>` / `SetRequired<T, K>` | flip optionality of chosen keys, rest untouched |
| `Except<T, K>` | `Omit` with key-existence checking (typo in `K` = compile error) |
| `Merge<A, B>` / `MergeDeep` | B's keys override A's — DTO composition |
| `Simplify<T>` | flatten an intersection into one readable object type (hover/diagnostics) |
| `RequireAtLeastOne<T, K>` / `RequireExactlyOne` | "at least/exactly one of these fields" contracts |
| `LiteralUnion<L, string>` | literal autocomplete without banning other strings |
| `Tagged<T, Tag>` | nominal/opaque ids when two `string`s must not mix |

## Worked example — a merge-patch payload

When a row's merge treats an explicit `null` as *keep* (a COALESCE upsert), the patch type must make
each field settable-or-omitted but never `null`. Compose `SetNonNullable` with `Partial`, derived
from the row so it has one author:

```ts
/** `Partial`, minus `null`: each field may be set or omitted, never cleared (the merge's contract). */
type SetOnly<T> = Readonly<SetNonNullable<Partial<T>>>

type ExampleUpsert<Row> = Readonly<Pick<Row, 'id'>> & SetOnly<Omit<Row, 'id'>>
```

## Gotchas

- **`Arrayable` — don't use type-fest's.** Theirs is mutable `T | T[]` (deliberately, pending
  microsoft/TypeScript#17002). This repo's single-or-array idiom is readonly; use
  **`Arrayable<T>` from `@kotodama/utils`** (`T | readonly T[]`), whose `isArray`/`toArray` companions
  do the narrowing the TS issue blocks.
- Domain shapes still derive from their single author (`<Name>Entity`/`<Name>Row` via
  `Pick`/`Except`, or `effect/Schema` combinators in core) — type-fest shapes the *projection*, it
  never becomes a second author. See `.claude/rules/drizzle-effect.md` (schema-boundary rule).
- Effect-land transformations (`.pick`/`.omit`/`mapFields` on a `Schema`) stay Schema-level — reach
  for type-fest only on plain TS types.
