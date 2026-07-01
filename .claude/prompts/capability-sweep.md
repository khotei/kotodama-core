# Capability sweep — append to any task

Paste this block after a task to force a divergent "what does the platform already do for this, **and
what structure does the problem itself want** — and what is the *best* way to do both?" pass *before*
any design is locked or code is written. It generalizes the Postgres lesson
(KB-33 → `.claude/agent-patterns/postgres-capabilities.md`) to every subsystem, and pairs it with a
symmetric *design* pass (`.claude/agent-patterns/design-heuristics.md`) so the sweep finds not just the
right primitive but the right **abstraction, decomposition, and domain model**.

---

Before you design or implement, run a **capability sweep** — do not jump to the first working approach,
and do not merely validate any design I hand you. Aim to surprise me with a genuinely better solution,
the kind a very experienced engineer would reach for — but every recommendation must be **researched and
weighed**, never unvetted cleverness.

The sweep has **two legs, and the best answer usually weaves them** — a native primitive is only a win
when it sits behind the right abstraction:
- **Leg A — capability sweep:** *what does the platform already do for this?* (the primitive you don't
  reinvent).
- **Leg B — design sweep:** *what structure does the problem itself want?* (the abstraction, seam, and
  domain model a gifted engineer originates — not just picks off a shelf).

0. **Establish this task's judging criteria first.** "Best" is task-specific — decide what actually
   matters *here* and how to weight it before comparing options. Axes fall in two groups:
   - **Leverage (leg A):** does it push work into the platform / avoid reinvention; **performance at the
     expected load**; **correctness / failure behavior**.
   - **Structure (leg B):** **type-safety & inference** (a hard default, not optional — see step 4);
     **extensibility / flexibility** at the points this will actually change; **simplicity &
     maintainability** (fewest moving parts a reader must hold at once).
   Say explicitly which axes dominate for this task and why; that ranking is how you pick. State it as
   a weave of the two legs, not a choice of one.

1. **Name the subsystems this task touches** (e.g. Postgres, Drizzle, Effect, HttpApi, SQS/queue,
   OpenAI/AI, React/TanStack, the build/bundler) — **and name the one or two core design decisions**
   the task turns on: the domain shape it must model, and *what is most likely to change* about it
   later. List both explicitly; leg A hangs off the subsystems, leg B off the design decisions.

2A. **For each subsystem, enumerate the relevant advanced/native capabilities** that could dissolve
   application code or improve performance — not just the CRUD/basics you'd reach for by default.
   Consult, in order:
   - the repo's own "reach for the primitive" catalogs — `.claude/agent-patterns/postgres-capabilities.md`,
     `effect-stdlib.md`, `type-fest.md`, and the other `agent-patterns/*`;
   - the vendored source under `repos/` (Effect, Drizzle) — the authority for exact shapes;
   - the **official docs on the web** (primary sources; verify version/availability — don't propagate a
     feature you haven't confirmed exists in the version we target).

2B. **For each core design decision, enumerate the structural options** — the decompositions, domain
   models, and composition patterns that could make a whole class of code (or bugs) disappear. Consult,
   in order: `.claude/agent-patterns/design-heuristics.md` (the "symptom → structural move" recognition
   map — the sibling of the Postgres catalog), then `.claude/rules/deep-modules.md`. Actively ask:
   - **Domain model / correct-by-construction** — can the type make illegal states *unrepresentable*
     (discriminated `Schema.Union` over a tag, not co-occurring booleans)? Can I *parse, don't validate*
     — turn untrusted input into a constrained type once at the boundary, so nothing downstream
     re-checks it?
   - **Decomposition & seams** — where is the real module boundary? What one design decision should this
     module *hide*? Put the seam exactly where the task said it will change — and **only** there (a seam
     for a change that isn't coming is speculation, not flexibility).
   - **Composition / effect & error architecture** — the deepest interface for how effects and errors
     flow: `Effect.fail` only for what a caller can handle, `die` for impossible states; cross-cutting
     concerns (retry, timeout, tracing) as decorator layers at wiring, kept out of pure core.

3. **Look for effective *combinations* — across both legs.** The win is often two features composed
   (`pgView` + `count(*) FILTER`; a keyset predicate + predicate pushdown; a discriminated `Schema.Union`
   + `decodeTo`), **or a native primitive shaped by the right abstraction** (the heavy `sql` hidden
   behind one narrow repo function; a decorator layer wrapping a boundary client). Map each candidate to
   the concrete symptom in *this* task.

4. **Type-safety & inference are a hard default, not an afterthought.** Prefer the construction that
   preserves static types and inference **end-to-end**. In this repo that means: Drizzle's typed query
   builder and `sql` with **column references** (type-safe), not raw SQL strings; `effect/Schema`
   /`createSelectSchema` for shapes; let types **infer** (per `effect-conventions.md` — don't hand-restate
   an `Effect.Effect<…>` you can infer). Treat any approach that forces `any`, an unchecked cast, or a
   raw untyped string as a cost to be justified, not a default.

5. **Flag reinvention in *both* directions — this is the taste, not a checklist:**
   - **Naive code reinvents a native feature** — a loop, a second query per row, a manual
     aggregate/dedup/collapse, a hand-rolled utility, threaded state — show the one-construct alternative.
   - **A pattern/abstraction is introduced where flat code is honest** — a layer that only forwards, a
     "flexible" config for a single caller, an interface for one implementation, a premature seam. The
     gifted move is as often *deleting* structure as adding it. **Say explicitly where you chose to keep
     the plain code and declined an abstraction, and why** — knowing where structure is *not* worth it is
     the harder half of the judgment.

6. **Apply the taste gate to both legs — and design it twice.** For each candidate (native *or*
   structural), name the specific complexity it removes here and what it adds; recommend it only if it
   removes more than it adds — judged against the step-0 criteria (`.claude/rules/deep-modules.md`).
   Prefer the **simplest recognized standard** that pushes work into the platform or into the type
   system. For any non-trivial interface, **sketch two genuinely different structures and compare** (the
   fastest route to a deeper one — deep-modules §8); state the current/obvious interface's cost, then the
   deeper alternative — signature/usage first, implementation second.

7. **Weigh the second-order consequences.** For the recommended shape, name: its **failure modes** (what
   breaks, how it's observed); how it **evolves** (what the next likely feature costs against it — cheap
   if the seam is right, expensive if not); and its **coupling / blast radius** (what a change here forces
   elsewhere). A solution that's elegant today but boxes in the next feature is not the best solution.

**Output first (before code): a short findings block** —
1. the task's judging criteria (step 0), as a weave of leverage + structure axes;
2. the recommended approach (name the native primitive **and** the abstraction that houses it);
3. 2–3 trade-offs weighed against those criteria, including the second-order consequences (step 7);
4. **where you deliberately kept plain code / declined an abstraction, and why** (step 5);
5. a citation for each factual claim (a docs URL, or a `repos/` / repo / `agent-patterns/` path).

Then wait for my go-ahead, or proceed if the task said to.
