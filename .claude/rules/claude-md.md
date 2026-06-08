# Maintaining `CLAUDE.md` and rules (context, not a code dump)

**Always-loaded rule.** A `CLAUDE.md` (or a rule file) is a cache of what the **code cannot say**.
The source is the source of truth for *what* the code is — types, signatures, return values, control
flow. These docs exist only for *why* it is that way, and for constraints that aren't local to one
file. Optimize for the next reader (usually a future Claude session) and for low drift.

## The test, before writing any line

1. **"Could I derive this by reading the package source?"** If yes → don't write it. Restating a
   signature, return type, param list, or an idiom that's visible in the code is **drift bait**: it
   duplicates the code, and the next rename or refactor silently turns it into a lie.
2. **"Would a reader get this wrong, or waste real time, without it?"** If yes → write it.

Sharp signal: **if a rename/refactor forces a `CLAUDE.md` edit, the doc was holding *what*, not
*why*.** Move that knowledge back to being implied by the code, and delete the line.

## Belongs (keep)

- **Decisions + the rejected alternative** — the *why*, and the option not taken. Unrecoverable from
  code, which only shows the survivor.
- **Invariants the types can't express**, and cross-file / cross-package coupling (e.g. "this read's
  SQL must match an index defined in `database/`").
- **Non-obvious gotchas** — footguns, ordering rules, version quirks.
- **Boundaries** — import rules, ownership, "this is the single source of X".
- **Pointers** — to the spec (Notion), `.claude/agent-patterns/*`, or the file where the surface lives.

## Does NOT belong (cut)

- Per-method / per-export **signature or return-type listings** — the `.ts` is the contract.
- Restating an idiom the code already shows (which `Context.Service` form, "deps captured at layer
  build", "returns `Option`") or anything competent about the stack an agent already knows.
- A narration of the test file — keep at most the run command + any non-obvious requirement
  (e.g. "needs Docker").
- Anything already stated in another doc — **link by name, don't restate** (the de-dup rule).

## Shape & timing

- **Short.** A repo `CLAUDE.md` is responsibilities + load-bearing decisions + gotchas + boundaries +
  pointers — not a manual. When in doubt, cut: a missing line costs one `Read`; a wrong line costs a
  silent mistake made with confidence.
- **Refresh only when a real change is about to land** (as part of preparing the commit), not on
  every exploratory edit — see the root `CLAUDE.md` "Maintaining these docs". Then `bun run lint`.
