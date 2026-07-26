---
paths:
  - "**/*.ts"
---

# Effect v4 conventions

**Source of truth: the vendored v4-beta source** (`repos/effect-smol/`) — NOT v3 docs or training
memory. The beta moved (ServiceMap→Context, Schema consolidation, HttpApi reshape, `Result` not
`Either`), so your v3 prior is actively wrong: it will "correct" valid v4 back to v3. **Verify an
unfamiliar API against the vendored source — don't invent it.** The idiom catalog is single-sourced
below; do NOT re-enumerate it in this file:

- **Effect's own LLM guide:** `repos/effect-smol/LLMS.md` (+ `MIGRATION.md`, `packages/effect/SCHEMA.md`).
- **Project cheat-sheets** (on-demand): `.claude/agent-patterns/effect-{stdlib,schema,context-and-layer,httpapi,errors}.md`.

Those hold the mechanics — `fnUntraced`-over-`gen`, class-syntax `Context.Service` + `Layer`,
`Data.TaggedError` + `catchTag`, `effect/Config`, `Result`, no `try/catch` in a generator. This file
holds only the **Kotodama usage decisions** the catalog can't tell you.

## Kotodama usage

- **Domain schemas are authored in `database/`** (`effect/Schema`); core + the API edge consume those
  entities and author only computed read/view models — never re-declare a domain shape.
- **In-beta APIs live under `effect/unstable/*`** (notably parts of HttpApi) — import from there, not a
  guessed stable path.
- Config: `effect/Config` via `@kotodama/platform/config`. DB: `drizzle-orm/effect-postgres` (see
  `drizzle-effect.md`). Entrypoint: `BunRuntime.runMain`. Alias global-shadowing namespaces:
  `import { Array as Arr } from 'effect'`.
- **Never import from `repos/`** in application code — import the published `effect`/`@effect/*`.

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

## Composition — the project's rule on top of the idiom

- **`fnUntraced`, not `fn("name")`** — `fn` auto-attaches a span; we place spans manually on
  meaningful units (`observability.md`).
- **Type params inline, let `E`/`R` infer** — a hand-written `Effect.Effect<…>` return signature is
  drift bait recomputed from every nested call; annotate the full signature only for an overload, a
  `Context.Service` shape, or a file where inference makes errors unreadable.
