# Effect v4 deltas — what the v3 prior gets wrong

**On-demand reference** (pointer-loaded from `.claude/rules/effect-conventions.md`). The source of
truth is the vendored source — `repos/effect-smol/packages/effect/src/<Module>.ts` (guide `LLMS.md`;
moves `MIGRATION.md` + `packages/effect/SCHEMA.md`). Grep the module file for the long tail; this
file only flags what the v3 training prior actively gets wrong. If anything drifts, the `.ts` wins.

## Renames & moved APIs (the v3 prior "corrects" these back — don't)

- **`ServiceMap` was renamed back to `Context`** during the beta — class-syntax `Context.Service`
  (`database/src/db.ts` is the in-repo model). Sources: `Context.ts` (`Service`, `Reference`),
  `Layer.ts`, `LayerMap.ts`. Whether a symbol deserves a tag at all is decided in
  `.claude/rules/effect-conventions.md` ("Service vs plain function") — read it first.
- **`Either` does not exist — it is `Result<A, E>`** (`Result.ts`); `Success`/`Failure` replace
  `Right`/`Left`, and `Array.partition`/`separate` operate on `Result`. Catalog: `succeed`/`fail` ·
  `fromNullishOr`/`fromOption` · `isSuccess`/`isFailure`/`isResult` · `match({onFailure,onSuccess})` ·
  `getOrElse`/`getOrNull`/`getOrUndefined` · `getSuccess`/`getFailure` (→`Option`) ·
  `map`/`mapError`/`mapBoth`/`flatMap` · `merge` · `filterOrFail`.
- **`Option.fromNullable` does not exist** — it's `fromNullishOr` (both `null`+`undefined`),
  `fromNullOr`, `fromUndefinedOr`. Also there: `getSomes`, `liftThrowable` (wrap a throwing fn).
- **It's `Predicate.isNotNullish`** (→`NonNullable`), NOT `isNotNullable` (doesn't exist); also
  `isNotNull`/`isNotUndefined` · `isTagged` (`_tag === tag`).
- **The Schema API was consolidated during the beta** — grep `Schema.ts` exports, never guess v3
  method names; refinements are `.check(Schema.isMinLength(1))`, NOT the v3
  `.pipe(Schema.minLength(1))`. One schema lib only — `effect/Schema`, never Zod/`io-ts`. Sources:
  `Schema.ts`, `SchemaAST.ts`, `SchemaTransformation.ts`, `SchemaGetter.ts`, `SchemaIssue.ts`;
  worked usage in `test/schema/*.test.ts`.
- **HttpApi is beta and lives under `effect/unstable/httpapi`** — never a guessed stable path;
  confirm imports against `src/unstable/httpapi/` (`HttpApi`, `HttpApiGroup`, `HttpApiEndpoint`,
  `HttpApiBuilder`, `HttpApiClient`, `HttpApiSecurity`, `HttpApiError`, `HttpApiSchema`,
  `HttpApiTest`, `OpenApi`). HTTP primitives: `src/unstable/http/`. Derive the typed client from the
  contract with `HttpApiClient.*` — never hand-roll one.

## Errors

Sources: `Data.ts` (`TaggedError`, `TaggedClass`, `$is`, `$match`), `Cause.ts`, `Effect.ts`
(`catchTag`/`catchTags`/`catchCause`).

- Define tagged errors with `Data.TaggedError(tag)<fields>`; **don't throw plain `Error`s inside
  Effects** — model failures in the error channel so callers `catchTag` exhaustively.
- Prefer `Data.$is(tag)` / `Data.$match` over manual `_tag` string comparisons.
- Errors that cross the wire (HttpApi responses) must be schema-backed so they encode/decode —
  `unstable/httpapi/HttpApiError.ts`.

## Stdlib first — the default for ANY utility logic, not just `Array`

**Before hand-writing any helper — a data transform, comparator, grouping/dedup, string/number/date
math, a retry loop, coordination, caching — assume `effect` already ships it and check the matching
module first.** The stdlib is ~130 modules (`ls repos/effect-smol/packages/effect/src` is the
inventory; grep the module file for the function). Hand-rolling what the stdlib provides is the same
defect as hand-rolling SQL the engine owns; write custom code only after the matching module came up
empty. Task → module map:

- **Data:** `Array` · `Chunk` · `Iterable` · `Record` · `Struct` · `Tuple` · `HashMap`/`HashSet`
  (+ `Mutable*`).
- **Absence & fallibility:** `Option` · `Result` · `UndefinedOr`.
- **Primitives:** `String` · `Number` · `Boolean` · `BigInt` · `BigDecimal` · `RegExp` ·
  `Encoding` (base64/hex).
- **Comparison & identity:** `Order`/`Ordering` (composable comparators — never a bare
  `(a,b) => a-b`) · `Equal`/`Equivalence` · `Hash`.
- **Functions & matching:** `Function` (`identity`, `constant`, `flow`, `dual`) · `Predicate` ·
  `Match` (exhaustive matching).
- **Time:** `DateTime` · `Duration` (accepts `'5 seconds'`) · `Cron` · `Clock` (testable now).
- **Effect-land:** `Schedule` (retry/backoff policy — never a hand-rolled retry loop) ·
  `Cache`/`ScopedCache` · `Ref`/`Deferred`/`Semaphore`/`Latch`/`Queue`/`PubSub` (coordination) ·
  `Random` (seedable) · `Stream`/`Sink`.

### Gotchas

- **Namespace imports shadow globals** (`Array`, `String`, `Number`, `Boolean`, `Function`) and trip
  Biome `noShadowRestrictedNames` — alias: `import { Array as Arr } from 'effect'`.
- **`Array.ensure(undefined)` → `[undefined]`, NOT `[]`** (it's `isArray(x) ? x : [x]`). For a single
  nullish value → `[]` use `Array.fromNullishOr`; for a value-or-array that may be absent, guard the
  undefined yourself: `x === undefined ? [] : Arr.ensure(x)`.
- Most functions are **`dual`** — both `f(self, ...args)` (data-first) and `f(...args)(self)` (pipe)
  work; `String`/`Number` ops are mostly data-last (built for pipes).
- `Array` surprises: `ensure` (value→`[value]`, array passthrough) · `fromNullishOr` (nullish→`[]`) ·
  `isArray` (narrows `T | readonly T[]`) · `getSomes` (`Iterable<Option<A>>`→`A[]`) · `filterMap`
  (map+drop none) · `partition` (via a `Result`-fn) · `groupBy` (→`Record<string, NonEmpty>`).
- **When NOT to reuse:** the taste gate applies — a correct, idiomatic JS one-liner is not
  "reinvention": `arr.filter(Boolean)` (drop falsy incl. `''`) has no clean Effect equivalent
  (`Array.getSomes` is for `Option`s; `Predicate.isString` keeps empty strings). Don't force a worse
  combinator to "use Effect" — flag the call, pick the simpler form.
