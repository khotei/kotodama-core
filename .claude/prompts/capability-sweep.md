# Capability sweep — append to any task

Paste this block after a task to force a divergent "what does the platform already do for this, and what
is the *best* way to do it?" pass *before* any design is locked or code is written. It generalizes the
Postgres lesson (KB-33 → `.claude/agent-patterns/postgres-capabilities.md`) to every subsystem.

---

Before you design or implement, run a **capability sweep** — do not jump to the first working approach,
and do not merely validate any design I hand you. Aim to surprise me with a genuinely better solution —
but every recommendation must be **researched and weighed**, never unvetted cleverness.

0. **Establish this task's judging criteria first.** "Best" is task-specific — decide what actually
   matters *here* and how to weight it before comparing options. Typical axes: **type-safety & inference**
   (see below — a hard default, not optional), **performance at the expected load**, **extensibility /
   flexibility** for likely future needs, **simplicity & maintainability**, **correctness / failure
   behavior**. Say explicitly which axes dominate for this task and why; that ranking is how you pick.

1. **Name the subsystems this task touches** (e.g. Postgres, Drizzle, Effect, HttpApi, SQS/queue,
   OpenAI/AI, React/TanStack, the build/bundler). List them explicitly.

2. **For each, enumerate the relevant advanced/native capabilities** that could dissolve application
   code or improve performance — not just the CRUD/basics you'd reach for by default. Consult, in order:
   - the repo's own "reach for the primitive" catalogs — `.claude/agent-patterns/postgres-capabilities.md`,
     `effect-stdlib.md`, `type-fest.md`, and the other `agent-patterns/*`;
   - the vendored source under `repos/` (Effect, Drizzle) — the authority for exact shapes;
   - the **official docs on the web** (primary sources; verify version/availability — don't propagate a
     feature you haven't confirmed exists in the version we target).

3. **Look for effective *combinations*** — the win is often two features composed (e.g. `pgView` +
   `count(*) FILTER`; a keyset predicate + predicate pushdown; a generated column + a GIN index; a
   discriminated `Schema.Union` + `decodeTo`), not a single call. Map each capability to the concrete
   symptom in *this* task.

4. **Type-safety & inference are a hard default, not an afterthought.** Prefer the construction that
   preserves static types and inference **end-to-end**. In this repo that means: Drizzle's typed query
   builder and `sql` with **column references** (type-safe), not raw SQL strings; `effect/Schema`
   /`createSelectSchema` for shapes; let types **infer** (per `effect-conventions.md` — don't hand-restate
   an `Effect.Effect<…>` you can infer). Treat any approach that forces `any`, an unchecked cast, or a
   raw untyped string as a cost to be justified, not a default.

5. **Flag where my/the naive approach reinvents a native feature** — a loop, a second query per row, a
   manual aggregate/dedup/collapse, a hand-rolled utility, threaded state — and show the one-construct
   alternative.

6. **Apply the taste gate** (`.claude/rules/deep-modules.md`): for each candidate, name the specific
   complexity it removes here and what it adds; recommend it only if it removes more than it adds — judged
   against the step-0 criteria. Prefer the **simplest recognized standard** that pushes work into the
   platform. Don't cargo-cult a feature where a plain approach is clearer — and say so when that's the case.

**Output first (before code): a short findings block** — the task's judging criteria (step 0), the
recommended approach, 2–3 trade-offs weighed against those criteria, and a citation for each factual
claim (a docs URL or a `repos/` / repo path). Then wait for my go-ahead, or proceed if the task said to.
