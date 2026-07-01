---
description: Capability sweep — research the best platform-native, type-safe solution before designing/coding
---

Run a **capability sweep** on the task in `$ARGUMENTS` (or, if empty, the current task in context)
*before* locking any design or writing code. Do not jump to the first working approach, and do not merely
validate a design you were handed. Aim for a genuinely better solution — but every recommendation must be
**researched and weighed**, never unvetted cleverness.

Follow the full protocol in `.claude/prompts/capability-sweep.md`. In short:

0. **Establish the task's judging criteria first** — what "best" means *here* (type-safety & inference,
   performance at load, extensibility, simplicity, correctness) and which axes dominate, and why.
1. **Name the subsystems** the task touches (Postgres, Drizzle, Effect, HttpApi, SQS, AI, React/TanStack…).
2. **Enumerate each subsystem's relevant advanced/native capabilities**, consulting in order: the repo
   catalogs (`.claude/agent-patterns/postgres-capabilities.md`, `effect-stdlib.md`, `type-fest.md`, …),
   the vendored `repos/` source, then official docs on the web (verify version/availability).
3. **Look for effective combinations**, not just single calls; map each to the concrete symptom.
4. **Type-safety & inference are a hard default** — Drizzle typed builder / `sql` with column refs (never
   raw strings), `effect/Schema`, inferred types; any `any`/cast/untyped string is a cost to justify.
5. **Flag where the naive approach reinvents a native feature** and show the one-construct alternative.
6. **Apply the deep-modules taste gate** — recommend a feature only if it removes more complexity than it
   adds, judged against the step-0 criteria; prefer the simplest recognized standard.

**Output a findings block first** (criteria → recommendation → 2–3 weighed trade-offs → a citation per
factual claim), then wait for go-ahead or proceed if the task said to. Do not write application code
during the sweep.
