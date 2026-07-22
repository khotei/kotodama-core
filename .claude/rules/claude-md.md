# Maintaining `CLAUDE.md` and rules (context, not a code dump)

**Always-loaded rule.** A `CLAUDE.md` (or a rule file) is a cache of what the **code cannot say**.
The source is the source of truth for *what* the code is; these docs exist only for the *why* and
for constraints that aren't local to one file. Optimize for the next reader and for low drift —
every line here is paid for in every matching session, so a rule earns its place only by changing
behaviour.

## The test, before writing any line

1. **"Would Claude get this right anyway — from the code, the surrounding style, or general
   knowledge of the stack?"** If yes → don't write it. Restating a signature, a function's
   behaviour, or a visible idiom duplicates the code, and the next refactor silently turns it
   into a lie.
2. **"Would a reader get this wrong, or waste real time, without it?"** If yes → write it.

Sharp signal: **if a rename/refactor forces a doc edit, the doc was holding *what*, not *why*** —
delete the line instead of updating it.

## Hard limits (check whenever preparing a commit that touches these files)

- **A package `CLAUDE.md` stays ≤ ~40 lines; a rule file ≤ ~80.** Over budget ⇒ cut, don't append.
- **Decision history lives in commit messages, never here.** `commits.md` mandates a `Decision:`
  paragraph and squash-merge lands it in `git log` — that IS the changelog. A doc states only the
  *currently binding* constraint: no dates, no "supersedes / reversed / user-driven" chains, no
  task/AC/feature numbers, no tombstones for moved or deleted code.
- **No behaviour narration.** A line that names a function/handler and describes what it does is
  banned — the reader has the source. Same for per-export signature/return-type listings and
  test-file narration (keep the run command + non-obvious requirements like "needs Docker").
- **One author per fact.** If another doc already states it, link by name; never restate.

## Belongs (keep)

- **Binding decisions + the rejected alternative** — only ones a reader would otherwise "fix" back.
- **Invariants the types can't express**, and cross-file / cross-package coupling (e.g. "this
  read's SQL must match an index defined in `core/database/`").
- **Non-obvious gotchas** — footguns, ordering rules, version quirks (usually debugging trophies).
- **Boundaries** — import rules, ownership, "this is the single source of X".
- **Pointers** — to the spec (Notion), `.claude/agent-patterns/*`, or the file where the surface lives.

## Shape & timing

Refresh only when a real change is about to land, as part of preparing the commit — never on
exploratory edits (then `bun run lint`). When in doubt, cut: a missing line costs one `Read`; a
wrong line costs a silent mistake made with confidence.
