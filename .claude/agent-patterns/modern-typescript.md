# Modern TypeScript/ECMAScript — the language-level "reach for the feature" catalog

**On-demand reference** (pointer-loaded from `/sweep`; NOT auto-loaded). The language sibling of
`effect-stdlib.md`: symptom in the code → the ES2023–ES2025 / TS 5.x feature that dissolves it.
Repo floor: TS ^5.7, `target/lib: esnext`, Bun 1.3 (JavaScriptCore — supports the ES2024 set and
most of ES2025; **verify the newest entries in Bun before relying on them**, e.g. `RegExp.escape`).

**Effect stdlib wins first.** For array/option/record/predicate work this repo reaches for
`effect`'s modules (see `effect-stdlib.md`); this catalog is for the layer beneath — features with
no Effect equivalent, or code outside Effect pipelines (scripts, helpers, tests).

## Runtime (ECMAScript)

| Symptom | Feature | Since |
|---|---|---|
| `reduce` building a `Record<key, T[]>` (grouping) | `Object.groupBy(items, fn)` / `Map.groupBy` | ES2024 |
| `let resolve; new Promise((res) => { resolve = res })` | `Promise.withResolvers()` | ES2024 |
| `try/finally` only to run cleanup on every exit path | `using` / `await using` + `Symbol.dispose` (in Effect code prefer `Scope`/`acquireRelease`) | TS 5.2 / ES2026 stage |
| Loops computing set intersection/difference/overlap | `Set#union/intersection/difference/symmetricDifference/isSubsetOf/isDisjointFrom` | ES2025 |
| Long array chains materializing intermediates over big/lazy inputs | Iterator helpers: `it.map().filter().take().toArray()` | ES2025 |
| `arr[arr.length - 1]`; reverse `for` to find from the end | `.at(-1)` · `findLast` / `findLastIndex` | ES2023 |
| `[...arr].sort()` / splice-and-copy dances | `toSorted` / `toReversed` / `toSpliced` / `with(i, v)` | ES2023 |
| Collecting an async iterable by hand | `Array.fromAsync(asyncIterable)` | ES2024 |
| `JSON.parse(JSON.stringify(x))` deep copy | `structuredClone(x)` | ES2022+ |
| Hand-escaping user input for a `RegExp` | `RegExp.escape(str)` (verify in Bun) | ES2025 |
| Sync-throwing function wrapped in `new Promise`/`async` glue | `Promise.try(fn)` | ES2025 |
| `hasOwnProperty.call(obj, k)` | `Object.hasOwn(obj, k)` | ES2022 |
| Losing the original error when re-throwing | `new Error(msg, { cause })` (this repo: `Data.TaggedError` fields) | ES2022 |
| Unicode-hostile character classes in regexes | the `v` flag (set operations, string properties) | ES2024 |

## Type level (TS 5.x)

| Symptom | Feature | Since |
|---|---|---|
| `as const` loses the constraint check, annotation loses the literals | `satisfies` (already the repo idiom — `satisfies Record<WordJobStage, …>` for exhaustiveness) | 4.9 |
| A generic infers `string` where you wanted the literal | `const` type parameters: `<const T extends …>` | 5.0 |
| One parameter's type wrongly drives inference for another | `NoInfer<T>` on the non-authoritative position | 5.4 |
| `.filter((x) => x !== null)` doesn't narrow the array type | inferred type predicates — arrow filters narrow automatically | 5.5 |
| A hand-written mapped/conditional utility type | `type-fest` first — see `type-fest.md` | — |
| Enum / value list + union + named map kept in sync by hand | `as const` tuple + `(typeof X)[number]` + derived map (the repo's `.values.ts` idiom) | — |
| A union switch that can silently miss a new member | handler record `satisfies Record<Union, T>` (dispatch via lookup, not `switch`) | — |
| Re-declaring a shape another type already owns | `Pick`/`Omit`/indexed access `T['k']`/`typeof` off the owner — derive, never restate | — |

## Cautions

- Prefer the **construction that keeps inference end-to-end**; a feature that forces a cast or an
  explicit annotation you otherwise wouldn't write is a cost to justify.
- Don't retrofit a feature where the plain form is clearer (`.at(-1)` on a 2-element tuple buys
  nothing) — the `/sweep` taste gate applies to language features exactly as to abstractions.
