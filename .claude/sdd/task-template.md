<!-- Generated from SDD playbook §6.2 — https://www.notion.so/36dfb28bd5f181238a86d26457bc24e7. Re-sync on change. -->

# Task row template (§6.2)

The body `/sdd:tasks` writes into each Tasks-DB row. It is what Claude Code sees when it picks up
the task in a fresh `/sdd:implement` session — self-contained but tight. The Notion `Title`
property is imperative, single-outcome, prefixed with the task number (e.g. *T07 — Scaffold
apps/api with Bun + Effect entrypoint*).

```markdown
> **Feature:** <mention parent Feature page>
> **Source spec:** <mention spec> §<section> *(<section title>)*
> **Autonomy:** AFK | HITL — AFK = implement + merge unattended; HITL = needs a human decision or review first (prefer AFK).
> **Covers ACs:** <feature AC IDs this task satisfies, e.g. AC-1, AC-3>
> **Slice:** vertical (cuts through every layer it touches; demoable on its own) | horizontal (single layer — foundational work only)
> **Reference repo / external doc (optional):** <link>

## Context
One paragraph. Why this task exists in the feature's task chain. What it builds on (dependencies); what depends on it. Anchors the agent before it starts editing files.

## Goal
One sentence. The single observable outcome. *"A fresh `git clone` followed by X completes cleanly"*, *"endpoint Y returns Z for input W"*, *"running V passes T"*. If you need a comma, you have two goals — split the task.

## What to do
1. <Imperative step. Name the file or surface it touches; include the relevant config or shape inline.>
2. <Next imperative step.>
3. ...

## Files to create
- /path/to/file.ext
- ...
(Or **Files to touch** if the task modifies existing files. List explicit paths; do not say "see folder X".)

## Acceptance criteria
- [ ] <AC verifiable by running a command, or by observing UI / API output.>
- [ ] <AC...>
- [ ] Tests added (happy + failure path, if applicable to this task).
- [ ] Spec change-log row added if implementation revealed a behaviour change.

## Notes & gotchas
- <Anti-pattern to avoid (e.g. "don't add `type: module` — Bun handles ESM natively").>
- <Subtle constraint from the Constitution / source spec the agent might miss.>
- <Decision deferred to a later task + rationale.>
```

## Sizing & autonomy (Kotodama)

- **Estimate** is **XS–M only** — `XS` ≤30 min · `S` ≤2 h · `M` ≤1 day. An `L` task splits; an
  `XL` is refused (it's a hidden mini-feature).
- A task is correctly scoped when it ships in **one** `/sdd:implement` session with a **single
  verifiable outcome**. Bigger → split; smaller → merge.
- Tag **Autonomy** `AFK` by default; `HITL` only for a real human gate (architecture call, design
  review, irreversible/data-destructive action). See `@.claude/sdd/property-contract.md`.
