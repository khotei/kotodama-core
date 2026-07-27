# Maintaining `CLAUDE.md` and rules (context, not a code dump)

**Always-loaded rule.** A `CLAUDE.md` / rule file caches what the **code cannot say** — the *why* and
constraints not local to one file. Every line is paid for in every matching session, so a line earns
its place only by changing behaviour.

## The test, before writing any line

1. **"Would Claude get this right anyway — from the code, the stack, or the surrounding style?"**
   Yes → don't write it (restating a signature/behaviour goes stale on the next refactor).
2. **"Would a reader get this wrong, or waste real time, without it?"** Yes → write it.

Sharp signal: **if a rename/refactor forces a doc edit, the doc held *what*, not *why* — delete the
line, don't update it.**

## Hard limits

- **Package `CLAUDE.md` ≤ ~40 lines; a rule file ≤ ~80.** Over budget ⇒ cut, don't append.
- **Decision history lives in commit messages, never here** (`commits.md`'s `Decision:` + squash IS
  the changelog). A doc states only the *currently binding* constraint — no dates, no
  supersedes/reversed chains, no task/AC/feature numbers, no tombstones for moved/deleted code.
- **No behaviour narration** — naming a function and describing what it does is banned (the reader
  has the source); likewise per-export signatures and test-file narration.
- **One author per fact** — if another doc states it, link by name; never restate.

## Belongs

Binding decisions + the rejected alternative (ones a reader would "fix" back) · invariants types
can't express + cross-file/cross-package coupling · non-obvious gotchas (footguns, ordering, version
quirks) · boundaries (import rules, ownership, single-source-of-X) · pointers (Notion,
`agent-patterns/*`, the file where the surface lives).

## On-demand reference (`agent-patterns/*`)

Pointer-loaded, so it doesn't tax the always-on budget — but the why-not-what test applies *harder*:
a cheat-sheet for a **stable, well-known API** (standard SQL, generic TS, textbook design theory)
teaches what the model already knows → cut it. Keep only a **beta/moving target it gets wrong**
(Effect v4, Drizzle-rc) or **this repo's own decisions**. Every anchor must name a symbol that exists
in THIS repo — a dangling or wrong-repo anchor is worse than no file.

Refresh only when a real change lands, as part of the commit — never on exploratory edits. When in
doubt, cut.
