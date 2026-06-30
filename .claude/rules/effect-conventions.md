---
paths:
  - "**/*.ts"
---

# Effect v4 conventions

**Source of truth:** `repos/effect-smol/` (the vendored v4 beta source). Before writing Effect code, read the relevant `.claude/agent-patterns/*.md` and inspect the real implementation/tests under `repos/effect-smol/`. See `.claude/rules/vendored-sources.md`. (If `repos/effect-smol/LLMS.md` exists upstream, read it first; do not invent it.)

## Core idioms

- **Schema, not Zod.** Use `effect/Schema` for all domain types. Word shapes are authored in `database/` (content schemas + `WordEntity`, via `createSelectSchema` + jsonb overrides); `core/` (and the API edge) consume them directly and author only computed read/view models (e.g. the API's `WordStateView`). See `.claude/rules/drizzle-effect.md`.
- **Reuse Effect's stdlib — don't hand-roll a utility.** Before writing any array / option / result / predicate / struct / record / order helper (a `toArray`, an `isSome`-filter-then-map, a `pick`, a `(a,b)=>a-b` comparator), reach for the matching `effect` module — `Array`, `Option`, `Result` (**not `Either` — gone in v4**), `Predicate`, `Struct`, `Record`, `Order`, `String`, `Number`, `Function`, `Tuple`. **Blessed index + gotchas: `.claude/agent-patterns/effect-stdlib.md`**; the vendored `repos/effect-smol/packages/effect/src/<Module>.ts` is the source of truth. **Alias global-shadowing namespaces** — `import { Array as Arr } from 'effect'` (Biome `noShadowRestrictedNames` flags `Array`/`String`/`Number`/`Boolean`/`Function`). The taste gate (`.claude/rules/deep-modules.md`) still applies — don't force a worse combinator where a plain one-liner is clearer. (This is why `@lexiai/utils` was deleted — it only re-implemented `Array.ensure`/`Array.isArray`.)
- **`Context.Service` / `Context.Tag`** for dependency injection (v4 renamed these back from `ServiceMap` during the beta). See `.claude/agent-patterns/effect-context-and-layer.md`.
- **`Layer`** for wiring services. Compose at the app entrypoint; never construct dependencies inside use cases.
- **In-beta APIs live under `effect/unstable/*`** — notably parts of `HttpApi`. Import from there, not a guessed stable path. See `.claude/agent-patterns/effect-httpapi.md`.
- **Errors:** tag with `Data.TaggedError`; handle with `Effect.catchTag` / `Effect.catchTags`. See `.claude/agent-patterns/effect-errors.md`.
- **Config:** build from `effect/Config` (`Config.string`, `Config.redacted` for secrets, `Config.all`). `@lexiai/config` owns `AppConfig`. Configs are yieldable in `Effect.gen`.
- **SQL / DB:** go through Drizzle's first-party Effect integration `drizzle-orm/effect-postgres` (`PgDrizzle` DB layer over `@effect/sql-pg`). The `effect-schema` row derivation is retired here — repos return `$inferSelect` rows; runtime validation of untrusted writes decodes through the database **entity** schemas (`WordEntityInsert`, `createSelectSchema` + jsonb overrides — see `.claude/rules/drizzle-effect.md`). Cheat-sheet `.claude/agent-patterns/drizzle-effect.md`.
- **Entrypoints:** `BunRuntime.runMain(program)` from `@effect/platform-bun`.

## Service vs plain function — when to reach for `Context.Service`

A `Context.Service` + `Layer` is a real cost (a tag + `.of()` + `Layer.effect` + a line in every
`Layer.provide` graph), so reach for one **only when the symbol *owns* something** — never merely
because it "touches I/O" (that test is transitive and leaks: every orchestrator transitively touches
I/O, so it would make everything a service). Make it a service iff at least one holds:
- **(a) it owns a resource/lifecycle, or captures a client/config at layer build** — a pool, an SDK
  client via `acquireRelease`, a compiled statement (`DB`, `QueueClient`, `AiService`, `StorageClient`);
- **(b) it is *actually* swapped in tests by a second impl** — a real alternate or a fixture
  (`ContentEngine` mock↔real, `WikiClient`'s `WikiClientTest`);
- **(c) it is an I/O chokepoint you decorate/reimplement at high fan-in** — one place to wrap every
  call with retry/trace/cache.

Grouping/namespacing is **not** a reason: a surface that owns nothing is a set of **bare exported
functions**, not a tag — the persistence ops are `selectWords` / `upsertWords` (a DB-verb prefix marks
the layer; see `.claude/rules/naming.md`), not a `WordsRepo` service or object. Wanting private helpers
is **not** a reason — module-private functions or local closures give you that for free.

**Role decides, not tier.** A swap seam can sit in `core/` (`ContentEngine`); a flow composer at the
top tier is still a plain function (`requestWordBuild`, `buildWord` in `use-cases/`). What stays a
**service** is the *boundary/adapter* — `DB`, the queue/AI/storage clients, `WikiClient`, the
`ContentEngine` swap seam. What is a **plain function with deps on the `R` channel** is everything else:
- **Repositories** — bare DB-verb functions whose ops `yield* DB` inside (`selectWords` / `upsertWords`,
  `selectWordJobStages` / `upsertWordJobStages`).
- **Use-cases** — bare app-flow functions (`requestWordBuild`, `buildWord`); they owned no resource, so
  the api/worker entrypoints just provide their boundary deps (`DB` / `JobsQueue` / `ContentEngine`).
- **Core logic/orchestration** — `ensureWordBuildable`, `readWordBuildSnapshot`, `assembleWord`.

A function takes its dependencies from the **`R` channel** — `const x = yield* DB` inside, or a call
like `selectWords(q)` whose own `DB` requirement rides `R` — **not** as threaded params. `R` bottoms
out at the real boundary services, which stay tags, so test-swapping a *dependency* still works without
the orchestrator being a service. No use-case needs to `provideService` its deps any more — there is no
service whose `R` must collapse to `never`; the requirements flow up to the entrypoint untouched.

**Decomposition is orthogonal to this choice.** How you break a deep unit into a public entry + private
helpers is decided separately, by the *kind* of logic:
- **Pure logic → a module-level function** (not exported only if local), so it is unit-testable without
  deps — `collapseWordState` (`word-state-collapse.ts`), the `prompts.ts` builders, `normalizeWordInput`. Don't
  bury pure logic in a closure; that forfeits the isolated test.
- **Context-closing helpers → local closures** inside the function body (`runStage` / `failStage` in
  `buildWord` close over `language` / `word` / the captured `engine`) — lifting them to module level
  would force pass-through-param threading (a deep-modules §5 red flag). These can't be unit-tested in
  isolation; that's fine — test them at the public seam (`.claude/rules/testing.md`), and extract a piece
  to a module-level function only if it grows nontrivial pure logic worth isolating (as word *creation*
  was lifted out of `buildWord` into the pure-ish `assembleWord` in `core/words`).

> Promote a function back to a service the day a real swap/resource need appears (e.g. a test wants to mock
> the policy) — track a *demonstrated* need, not a just-in-case.

## Composition style — `gen` / `fnUntraced` / `pipe`

The default is a **generator body + combinators as a tail**, not chains of combinators alone (Effect's
own guidance: `repos/effect-smol/LLMS.md`, `.patterns/effect.md` "When to Use What"). The split:

- **A value (an `Effect`)** → `Effect.gen(function* () { … })`. Acquire services with `yield*` inside
  it (`const engine = yield* ContentEngine`), **never** `Service.pipe(Effect.flatMap(s => …))` — a
  `flatMap` whose only job is to name the service is `yield*` written long.
- **A function that takes args and returns an `Effect`** → `Effect.fnUntraced(function* (args) { … })`.
  **Never `(args) => Effect.gen(…)`.** **Type the *parameters* inline** (`function* (language: Language,
  word: string)`) and **let `E`/`R` infer** — do **not** restate the result as a `const fn: (…) =>
  Effect.Effect<…>` signature. A hand-written `Effect.Effect<…>` union is drift bait and pure
  change-amplification: it is recomputed from every nested call, so a new failure or requirement deep
  down forces a manual edit up the chain — while the real contract is already pinned downstream (the
  entrypoint provides `R`, so a leaked requirement fails `runMain`; the `HttpApi` declares the wire `E`).
  Annotate the full signature **only** when inference can't express it or the restatement earns its cost:
  an **overloaded** function (`upsertWords`' `UpsertWords` type — overloads can't be inferred), a
  **`Context.Service` shape** (the interface *is* the contract), or a specific file where the inferred
  type makes call-site errors unreadable or slows `tsc` (a local remedy, not a default). This mirrors
  the maintainers' own default: `repos/effect-smol/.patterns/effect.md` shows
  `Effect.fnUntraced(function* (param: string) { … })` (params inline, `E`/`R` inferred), and
  `repos/effect-smol/LLMS.md` presents pinning the return as an *opt-in* — `Effect.fn.Return<A, E, R>`
  on the generator ("**you can** use `Effect.fn.Return` to specify the return type"). With our
  `fnUntraced` (we reject `fn("name")` below) that opt-in is the `const` signature; reach for it only
  under the three exceptions above.
- **`fnUntraced`, not `fn("name")`:** `fn` auto-attaches a span; we place spans **manually** on
  meaningful units (`.claude/rules/observability.md`), so the auto-span is unwanted.
- **Attach a fn's tail combinators as extra args, not `.pipe`** — `Effect.fnUntraced(function* …, Effect.mapError(…))`
  (a `.pipe` *inside* the body, on an inner effect, is fine).
- **`return yield*`** for terminal effects (`Effect.fail`/`interrupt`) so TS sees the dead code below.
  Never `try/catch` in a generator — errors ride the type system.

`pipe` (the **`.pipe` method** — `Effect`/`Layer`/`Config` are all `Pipeable`; the standalone `pipe()`
function is only for a non-`Pipeable` head, rarely needed here) stays correct for: a **single**
combinator tail; point-free transformation pipelines (`flatMap(decodeSearch)`, `map`); provision tails
(`provide`/`provideService`); error tails (`catchTags`/`mapError`/`orDie`); and **layer/config
composition** (`SomeLayer.pipe(Layer.provide(…), Layer.provideMerge(…))`) — `gen` is wrong for wiring.
Keep `Effect.all({ … })` for **parallel** service/data acquisition; don't unroll it into sequential
`yield*`.

## Avoid

- Guessing v4 APIs from v3 docs or training memory — the beta moved (ServiceMap→Context, Schema consolidation, HttpApi reshape). Check `repos/effect-smol/`.
- Importing from `repos/` in application code — keep importing the published `effect` / `@effect/*` packages.
