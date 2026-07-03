---
paths:
  - "**/*.ts"
---

# Effect v4 conventions

**Source of truth: `repos/effect-smol/`** (the vendored v4 beta source). Never guess v4 APIs from
v3 docs or training memory — the beta moved (ServiceMap→Context, Schema consolidation, HttpApi
reshape). When unsure of an API shape, verify against the vendored source or the matching
`.claude/agent-patterns/*.md` cheat-sheet — don't invent, but don't ritually re-read them when the
codebase already shows the idiom.

## Core idioms

- **Schema, not Zod** — `effect/Schema` for all domain types. Word shapes are authored in
  `database/`; core and the API edge consume them and author only computed read/view models.
- **Reuse Effect's stdlib** before hand-rolling any array/option/predicate/struct/order helper —
  blessed index + gotchas: `.claude/agent-patterns/effect-stdlib.md`. `Result`, not `Either` (gone
  in v4). Alias global-shadowing namespaces: `import { Array as Arr } from 'effect'`.
- **`Context.Service` / `Context.Tag`** for DI; **`Layer`** for wiring — compose at the app
  entrypoint, never construct dependencies inside use cases.
- **In-beta APIs live under `effect/unstable/*`** (notably parts of HttpApi) — import from there,
  not a guessed stable path.
- Errors: `Data.TaggedError` + `Effect.catchTag(s)`. Config: `effect/Config` via `@kotodama/config`.
  DB: `drizzle-orm/effect-postgres` (see `.claude/rules/drizzle-effect.md`). Entrypoints:
  `BunRuntime.runMain`.

## Service vs plain function — when to reach for `Context.Service`

A `Context.Service` + `Layer` is a real cost, so reach for one **only when the symbol *owns*
something** — never merely because it "touches I/O" (that test is transitive and would make every
orchestrator a service). Make it a service iff at least one holds:

- **(a)** it owns a resource/lifecycle, or captures a client/config at layer build (`DB`,
  `QueueClient`, `AiService`);
- **(b)** it is *actually* swapped in tests by a second impl (`ContentEngine` mock↔real);
- **(c)** it is an I/O chokepoint you decorate at high fan-in (one place to wrap retry/trace).

Grouping/namespacing is **not** a reason (bare exported functions + the file give you that), and
neither is wanting private helpers (module-private functions do). **Role decides, not tier:**
repositories, use-cases, and core orchestration are all **plain functions with deps on the `R`
channel** — `yield* DB` inside, never threaded params; `R` bottoms out at the real boundary
services, which stay tags, so test-swapping a *dependency* still works. Promote a function back to
a service the day a real swap/resource need appears — a demonstrated need, not just-in-case.

Decomposition is orthogonal: pure logic → a module-level function (unit-testable without deps);
context-closing helpers → local closures inside the body (lifting them would force pass-through
param threading) — test those at the public seam.

## Composition style — `gen` / `fnUntraced` / `pipe`

- **A value (an `Effect`)** → `Effect.gen(function* () { … })`; acquire services with `yield*`
  inside — never `Service.pipe(Effect.flatMap(s => …))`.
- **A function returning an `Effect`** → `Effect.fnUntraced(function* (args) { … })`, never
  `(args) => Effect.gen(…)`. **Type the parameters inline and let `E`/`R` infer** — a hand-written
  `Effect.Effect<…>` return signature is drift bait recomputed from every nested call; annotate the
  full signature only for an overload, a `Context.Service` shape, or a file where inference makes
  errors unreadable.
- **`fnUntraced`, not `fn("name")`** — `fn` auto-attaches a span; spans are placed manually on
  meaningful units (`.claude/rules/observability.md`).
- Attach a fn's tail combinators as extra args (`Effect.fnUntraced(function* …, Effect.mapError(…))`),
  not `.pipe` on the fn.
- **`return yield*`** for terminal effects so TS sees the dead code. Never `try/catch` in a
  generator.
- `.pipe` stays correct for: a single-combinator tail, point-free pipelines, provision/error tails,
  and **layer/config composition** (`gen` is wrong for wiring). Keep `Effect.all({ … })` for
  parallel acquisition.

## Avoid

- Importing from `repos/` in application code — keep importing the published `effect`/`@effect/*`
  packages.
