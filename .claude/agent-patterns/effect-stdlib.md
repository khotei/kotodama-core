# Effect v4 stdlib — blessed reuse catalog

**On-demand reference** (pointer-loaded from `.claude/rules/effect-conventions.md`, never auto-loaded).
Effect ships a large standard library of data/utility modules. **Before hand-rolling any
array / option / result / predicate / struct / record / order / string / number helper, reach for the
matching `effect` module** — the same rule `type-fest` gets for types. A custom `toArray`, an
`isSome`-filter-then-map, a `pick`, a `(a,b) => a-b` comparator: all already exist, typed and tested.

> **Source of truth = the vendored source**, `repos/effect-smol/packages/effect/src/<Module>.ts`
> (read-only; see `.claude/rules/vendored-sources.md`). This catalog is a curated index of the
> functions agents most often re-invent — **grep the module file for the long tail.** Every entry below
> was verified against that source; if one ever drifts, the `.ts` wins.

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

## Modules (the functions most worth reaching for)

### `Array` (alias `Arr`) — array combinators
`ensure` (value→`[value]`, array passthrough) · `fromIterable` · `fromNullishOr` (nullish→`[]`) ·
`isArray` (narrows `T | readonly T[]`) · `isArrayNonEmpty`/`isArrayEmpty` · `head`/`last`/`get` (→`Option`) ·
`getSomes` (`Iterable<Option<A>>`→`A[]`) · `filterMap` (map+drop none) · `partition` (via a `Result`-fn) ·
`map`/`filter`/`flatMap`/`reduce` · `dedupe`/`dedupeWith` · `groupBy` (→`Record<string, NonEmpty>`) ·
`sort(Order)`/`sortBy(...Orders)` · `findFirst` (→`Option`).

### `Option` — absence as a value (not `null`/error channel)
`some`/`none` · `fromNullishOr`/`fromNullOr`/`fromUndefinedOr` · `isSome`/`isNone`/`isOption` ·
`match({onNone,onSome})` · `getOrElse`/`getOrNull`/`getOrUndefined` · `map`/`flatMap`/`filter` ·
`firstSomeOf` · `toArray` · `liftThrowable` (wrap a throwing fn).

### `Result` — synchronous success-or-failure (the `Either` replacement)
`succeed`/`fail` · `fromNullishOr`/`fromOption` · `isSuccess`/`isFailure`/`isResult` ·
`match({onFailure,onSuccess})` · `getOrElse`/`getOrNull`/`getOrUndefined` · `getSuccess`/`getFailure` (→`Option`) ·
`map`/`mapError`/`mapBoth`/`flatMap` · `merge` · `filterOrFail`.

### `Predicate` — type guards + predicate combinators
`isString`/`isNumber`/`isBoolean`/`isBigInt`/`isSymbol` · **`isNotNullish`** (→`NonNullable`)/`isNotNull`/`isNotUndefined` ·
`isNullish`/`isNull`/`isUndefined` · `isObject`/`isFunction`/`isDate`/`isError`/`isIterable` ·
`hasProperty` · `isTagged` (`_tag===tag`) · `and`/`or`/`not` · `mapInput`.

### `Struct` — keyed operations on plain objects (precise types)
`pick(keys)`/`omit(keys)` (both dual; missing keys ignored) · `get` · `keys` · `assign` (typed spread) ·
`evolve` (per-key transforms) · `renameKeys` · `map`/`mapPick`/`mapOmit`.

### `Record` — string/symbol-keyed records as a collection (vs `Object.entries().map()`)
`fromEntries`/`toEntries` · `get` (→`Option`)/`has` · `keys`/`values`/`size` · `map`/`mapKeys` ·
`filter`/`filterMap` · `getSomes` (drop `None` values) · `collect` (→array) · `singleton`.

### `Order` — composable comparators (vs `(a,b)=>a-b`)
`Number`/`String`/`Boolean`/`BigInt`/`Date` (instances) · `make` · `mapInput` (order a type by a derived
key; dual) · `combine`/`combineAll` (tie-breakers) · `flip` · `Tuple`/`Struct` (compound orders) ·
`min`/`max`/`clamp` · `isBetween`/`isLessThan`/`isGreaterThan`. (`Order.Number` defines NaN ordering.)

### `String` (alias if imported as namespace) — pipeable string ops + case conversion
`isString`/`isEmpty`/`isNonEmpty` · `trim`/`trimStart`/`trimEnd` · `split`/`includes`/`startsWith`/`endsWith` ·
`replace`/`replaceAll` · `capitalize`/`uncapitalize`/`toUpperCase`/`toLowerCase` ·
`camelCase`/`kebabCase`/`snakeCase`/`pascalCase`/`constantCase` · `indexOf`/`lastIndexOf` (→`Option`).

### `Number` — numeric ops with safe/total variants
`sum`/`subtract`/`multiply` · `divide` (→`Option`, none on /0) / `divideUnsafe` (raw `/`) ·
`increment`/`decrement` · `parse` (→`Option`) · `clamp`/`min`/`max`/`between` · `sumAll`/`multiplyAll` ·
`round`/`sign`/`remainder` · `isNumber`.

### `Function` — composition + plumbing
`pipe`/`flow` · `identity`/`constant` · `constTrue`/`constFalse`/`constNull`/`constUndefined`/`constVoid` ·
`dual` (author data-first/last) · `compose`/`flip` · `tupled`/`untupled` · `absurd` · `memoize`.

### `Tuple` — typed fixed-length tuple ops
`make` · `get` · `pick`/`omit` (by index, dual) · `appendElement`/`appendElements` ·
`map`/`mapPick`/`mapOmit` · `evolve` · `renameIndices`.

### `Boolean` — boolean logic as combinators
`isBoolean` · `match({onFalse,onTrue})` · `not`/`and`/`or`/`xor`/`nand`/`nor`/`eqv`/`implies` ·
`every`/`some` (fold a collection) · `Order`/`Equivalence`.

## When NOT to reuse

The taste gate still applies — reuse only when it removes more than it adds. A correct, idiomatic JS one-liner is not "reinvention": e.g. `arr.filter(Boolean)` (drop falsy
incl. `''`) has no clean Effect equivalent — `Array.getSomes` is for `Option`s and `Predicate.isString`
keeps empty strings. Don't force a worse combinator to "use Effect"; flag the call, pick the simpler form.
