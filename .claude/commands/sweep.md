---
description: "On-demand design + platform sweep: shake written code and propose simpler, deeper, more native alternatives"
argument-hint: "[paths | diff range] (default: current branch diff vs main)"
---

Run a **sweep** — a second look at code that already works, hunting simpler, deeper, more native
shapes across this stack (Effect v4, Drizzle, Postgres, Bun, modern TS). Every recommendation must
be verified, never unvetted cleverness. **Findings only — write no application code until the user
picks what to apply.**

## Scope

`$ARGUMENTS` names paths, a diff range, **or a feature/plan (e.g. `F-CONT-007` — fetch its Plan
from Notion and sweep the *planned* design before any code exists)**; empty ⇒ the current branch's
diff against `main` (fall back to the working-tree diff). Read the target plus enough of the
existing code to judge it, then state the **judging criteria for this code** before comparing
anything: which axes dominate here — leverage (platform reuse, performance at expected load,
correctness/failure behavior) vs structure (type-safety & inference, extensibility where change is
actually coming, fewest moving parts).

## Leg A — platform sweep (don't reinvent)

For each subsystem the code touches, enumerate the advanced/native capabilities that could dissolve
hand-written code or improve performance — not the CRUD basics. Consult in order:
**`.claude/agent-patterns/effect-v4-deltas.md`** (what the v3 prior gets wrong + the stdlib-reuse
catalog), then the vendored `repos/` source (the authority for exact shapes), then official docs on
the web; verify a feature exists in the pinned version before recommending it. For SQL, prefer the
one-construct Postgres primitive behind a typed repo function (`.claude/rules/drizzle-effect.md`);
for type-level work, type-fest before a hand-rolled mapped/conditional type.

## Leg B — design shake (the structure the problem wants)

Scan the diff/plan for symptom → structural move: deep modules over shallow forwarding layers,
composition over creation, correct-by-construction types, and deletions — a needless seam or a
one-implementation interface removed is as valid a finding as one added. For any non-trivial
interface, **sketch two genuinely different structures** (signature/usage first, implementation
second) and compare against the judging criteria.

## The taste gate — both ways, load-bearing

Recommend a candidate (native or structural) only if it removes more complexity than it adds. Flag
reinvention in **both** directions: naive code reinventing a native feature, AND an abstraction
added where flat code is honest. Type-safety & inference are a hard default: any `any`, unchecked
cast, or raw untyped SQL string is a cost to justify. For the winning shape, weigh second-order
consequences: failure modes, what the next likely feature costs against it, coupling/blast radius.

## Output — a ranked findings report

For each finding: the current shape → the proposed shape (name the native primitive AND the
abstraction that houses it) → what it removes vs what it adds → verdict. Include a section for
**declined ideas** — where you deliberately kept the plain code and why. Cite each factual claim
(docs URL, `repos/` path, or catalog §). Then stop and let the user pick what to apply.
