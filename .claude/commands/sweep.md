---
description: Capability sweep — research the best platform-native, type-safe solution before designing/coding
---

Run a **capability sweep** on the task in `$ARGUMENTS` (or, if empty, the current task in context)
*before* locking any design or writing code. Do not jump to the first working approach, and do not merely
validate a design you were handed. Aim for a genuinely better solution — the kind a very experienced
engineer would reach for — but every recommendation must be **researched and weighed**, never unvetted
cleverness.

The sweep has **two legs, and the best answer usually weaves them:** **A — capability** (what the
platform already does, so you don't reinvent) and **B — design** (the abstraction, seam, and domain model
the problem itself wants). Follow the full protocol in `.claude/prompts/capability-sweep.md`. In short:

0. **Establish the task's judging criteria first** — what "best" means *here*, as a weave of *leverage*
   axes (platform reuse, performance at load, correctness/failure) and *structure* axes (type-safety &
   inference, extensibility where it will change, simplicity); say which dominate and why.
1. **Name the subsystems** the task touches (Postgres, Drizzle, Effect, HttpApi, SQS, AI, React/TanStack…)
   **and the core design decisions** it turns on — the domain shape, and what will most likely change.
2A. **Enumerate each subsystem's advanced/native capabilities** — consult the repo catalogs
   (`postgres-capabilities.md`, `effect-stdlib.md`, `type-fest.md`, …), the vendored `repos/` source,
   then official docs (verify version/availability).
2B. **Enumerate the structural options** for each design decision — consult
   `.claude/agent-patterns/design-heuristics.md` (symptom → structural move), then `deep-modules.md`:
   make illegal states unrepresentable, *parse don't validate*, put the seam only where it will change,
   effects/errors + cross-cutting concerns as decorator layers.
3. **Look for effective combinations across both legs** — often a native primitive *shaped by* the right
   abstraction (heavy `sql` behind one narrow repo function). Map each to the concrete symptom.
4. **Type-safety & inference are a hard default** — Drizzle typed builder / `sql` with column refs (never
   raw strings), `effect/Schema`, inferred types; any `any`/cast/untyped string is a cost to justify.
5. **Flag reinvention both ways** — naive code reinventing a native feature *and* an abstraction/pattern
   added where flat code is honest; **say where you kept plain code and declined a seam, and why**.
6. **Taste gate + design it twice** — recommend a candidate (native or structural) only if it removes more
   complexity than it adds; for any non-trivial interface, sketch two genuinely different structures.
7. **Weigh second-order consequences** — failure modes, how it evolves (cost of the next feature),
   coupling / blast radius.

**Output a findings block first** (criteria → recommendation naming the primitive *and* its abstraction →
2–3 weighed trade-offs incl. consequences → where you declined an abstraction → a citation per factual
claim), then wait for go-ahead or proceed if the task said to. Do not write application code during the
sweep.
