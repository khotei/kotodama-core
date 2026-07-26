# Effect v4 stdlib — blessed reuse catalog

**On-demand reference** (pointer-loaded from `.claude/rules/effect-conventions.md`, never auto-loaded).
Effect ships a large standard library of data/utility modules. **Before hand-rolling any
array / option / result / predicate / struct / record / order / string / number helper, reach for the
matching `effect` module** — the same rule `type-fest` gets for types. A custom `toArray`, an
`isSome`-filter-then-map, a `pick`, a `(a,b) => a-b` comparator: all already exist, typed and tested.

> **Source of truth = the vendored source**, `repos/effect-smol/packages/effect/src/<Module>.ts`
> (read-only; see `.claude/rules/vendored-sources.md`). **Grep the module file for the long tail** —
> Struct/Record/Order/String/Number/Function/Tuple/Boolean all carry the obvious combinators; this
> file only flags what the v3 prior gets wrong. If anything drifts, the `.ts` wins.

## Cross-cutting gotchas (read first)

- **`Either` does not exist — it is `Result<A, E>`** (`Result.ts`). `Success`/`Failure` replace
  `Right`/`Left`. `Array.partition`/`separate` operate on `Result`, not `Either`. Old web docs lie here.
- **Namespace imports shadow globals.** `import { Array } from 'effect'` (and `String`, `Number`,
  `Boolean`, `Function`) trips Biome `noShadowRestrictedNames`. **Alias:** `import { Array as Arr } from 'effect'`.
- **`Array.ensure(undefined)` → `[undefined]`, NOT `[]`** (it's `isArray(x) ? x : [x]`). For a single
  nullish value → `[]` use `Array.fromNullishOr`; for `Arrayable<T> | undefined` (a value-or-array that
  may be absent) guard the undefined yourself: `x === undefined ? [] : Arr.ensure(x)`.
- **`Option.fromNullable` does not exist** — it's `fromNullishOr` (both `null`+`undefined`), `fromNullOr`,
  `fromUndefinedOr`.
- **It's `Predicate.isNotNullish`, not `isNotNullable`** (the latter doesn't exist).
- Most functions are **`dual`** — both `f(self, ...args)` (data-first) and `f(...args)(self)` (pipe) work.
  `String`/`Number` ops are mostly data-last (built for pipes).

## The renamed / surprising entries (grep the module for the rest)

### `Array` (alias `Arr`)
`ensure` (value→`[value]`, array passthrough) · `fromNullishOr` (nullish→`[]`) ·
`isArray` (narrows `T | readonly T[]`) · `getSomes` (`Iterable<Option<A>>`→`A[]`) ·
`filterMap` (map+drop none) · `partition` (via a `Result`-fn) · `groupBy` (→`Record<string, NonEmpty>`).

### `Option`
`fromNullishOr`/`fromNullOr`/`fromUndefinedOr` (NOT `fromNullable`) · `getSomes` · `liftThrowable` (wrap a throwing fn).

### `Result` — synchronous success-or-failure (the `Either` replacement)
`succeed`/`fail` · `fromNullishOr`/`fromOption` · `isSuccess`/`isFailure`/`isResult` ·
`match({onFailure,onSuccess})` · `getOrElse`/`getOrNull`/`getOrUndefined` · `getSuccess`/`getFailure` (→`Option`) ·
`map`/`mapError`/`mapBoth`/`flatMap` · `merge` · `filterOrFail`.

### `Predicate`
**`isNotNullish`** (→`NonNullable`, NOT `isNotNullable`)/`isNotNull`/`isNotUndefined` · `isTagged` (`_tag===tag`).

## When NOT to reuse

The taste gate still applies — reuse only when it removes more than it adds. A correct, idiomatic JS one-liner is not "reinvention": e.g. `arr.filter(Boolean)` (drop falsy
incl. `''`) has no clean Effect equivalent — `Array.getSomes` is for `Option`s and `Predicate.isString`
keeps empty strings. Don't force a worse combinator to "use Effect"; flag the call, pick the simpler form.
