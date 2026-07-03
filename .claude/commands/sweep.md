---
description: "On-demand design + platform sweep: shake written code and propose simpler, deeper, more native alternatives"
argument-hint: "[paths | diff range] (default: current branch diff vs main)"
---

Run an on-demand **sweep** — a creative but rigorously vetted second look at code that already
works. Act as two experts in one: a master of software design (deep modules, SOLID/GRASP,
composition, domain modelling, correct-by-construction types) and a top-tier TypeScript engineer
fluent in the newest language/stdlib capabilities of this stack (Effect v4, Drizzle, Postgres, Bun,
modern TS). Aim to surprise with a genuinely better shape — but every recommendation must be
researched and weighed, never unvetted cleverness. **Findings only — write no application code
until the user picks what to apply.**

## Scope

`$ARGUMENTS` names paths, a diff range, **or a feature/plan (e.g. `F-CONT-007` — fetch its Plan
from Notion and sweep the *planned* design before any code exists)**; empty ⇒ the current branch's
diff against `main` (fall back to the working-tree diff). Read the target plus enough of the
existing code to judge it, then
state the **judging criteria for this code** before comparing anything: which axes dominate here —
leverage (platform reuse, performance at expected load, correctness/failure behavior) vs structure
(type-safety & inference, extensibility where change is actually coming, fewest moving parts).

## Leg A — platform sweep (don't reinvent)

For each subsystem the code touches, enumerate the advanced/native capabilities that could dissolve
hand-written code or improve performance — not the CRUD basics. Consult in order: the repo catalogs
— **`.claude/agent-patterns/postgres-capabilities.md`** (SQL primitives),
**`.claude/agent-patterns/effect-stdlib.md`** (Effect's data/utility modules),
**`.claude/agent-patterns/modern-typescript.md`** (ES2023–25 / TS 5.x language features),
**`.claude/agent-patterns/type-fest.md`** (utility types) — then the vendored `repos/` source (the
authority for exact shapes), then official docs on the web; verify a feature exists in the pinned
version before recommending it.

## Leg B — design shake (the structure the problem wants)

Work from **`.claude/agent-patterns/design-principles.md`** — the symptom → structural-move
recognition map (Ousterhout, SOLID/GRASP, the classic patterns in their functional/Effect form,
and the simplicity tie-breakers). Scan the diff/plan against its table; for any non-trivial
interface, **sketch two genuinely different structures** (signature/usage first, implementation
second) and compare against the judging criteria.

## The taste gate — both ways, load-bearing

Recommend a candidate (native or structural) only if it removes more complexity than it adds.
Flag reinvention in **both** directions: naive code reinventing a native feature, AND an
abstraction added where flat code is honest — deleting structure is as gifted a move as adding it.
Type-safety & inference are a hard default: any `any`, unchecked cast, or raw untyped SQL string is
a cost to justify. For the winning shape, weigh second-order consequences: failure modes, what the
next likely feature costs against it, coupling/blast radius.

## Output — a ranked findings report

For each finding: the current shape → the proposed shape (name the native primitive AND the
abstraction that houses it) → what it removes vs what it adds → verdict. Include a section for
**declined ideas** — where you deliberately kept the plain code and why. Cite each factual claim
(docs URL, `repos/` path, or catalog §). Then stop and let the user pick what to apply.
