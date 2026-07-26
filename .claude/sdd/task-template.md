<!-- Task body /sdd:tasks writes into a Work sub-item (Type=Task). Model owner: «Template — Features» → the Tasks-are-sub-items block. Re-sync on change. -->

# Task sub-item template

The body `/sdd:tasks` writes into each **Task sub-item** of a Feature (Work `Type = Task`, linked by
**Parent item**). It is what Claude Code sees when it picks the task up in a fresh `/sdd:implement`
session — self-contained but tight. The Notion `Title` is imperative, single-outcome, prefixed with
the slice number (e.g. *T3 · loader — library.loader.ts*). The body carries a **Context Pack** up
top and, once run, an **Evidence** section.

```markdown
> **Parent item:** <the Feature this task slices — the sub-item link>
> **Autonomy:** Operator | Collaborator | Consultant | Approver | Observer — the leash for this task (ambiguity × irreversibility). See the Autonomy scale in `@.claude/sdd/property-contract.md`.

## Context Pack
> **Goal:** the single observable outcome (if you need a comma, it's two tasks).
> **Hard AC:** the exact feature AC IDs this task must satisfy (e.g. AC-1, AC-3) — the contract, committed first.
> **In / out:** what this task touches, and what it must NOT touch.
> **No mid-task rescoping:** if the slice proves wrong or grows past its boundary (or past ~400 LOC), STOP and return to shaping — do not silently expand.
> **Linked files & playbooks:** explicit repo paths + the playbook(s) to follow. Point, don't restate.

## What to do
1. <Imperative step. Name the file / surface it touches; include the relevant config or shape inline.>
2. <Next imperative step.>

## Files to create / touch
- /path/to/file.ext
(List explicit paths; do not say "see folder X".)

## Acceptance criteria
- [ ] <AC verifiable by running a command, or by observing UI / API output.>
- [ ] Tests added (happy + failure path, if applicable).

## Evidence (filled by the run, read by the human at the review gate)
The proof a reviewer needs, not a claim: the check that ran + its **actual output**; the diff summary (≤400 LOC); which ACs are satisfied and how (URL / command / screenshot). Recorded on the **Run** row (Handoff + Evidence). "It works" is not evidence.

## Notes & gotchas
- <Anti-pattern to avoid.>
- <An invariant the type can't express that the agent might miss.>
```

## Sizing & autonomy (Kotodama)

- **Estimate** is **XS–M only** — `XS` ≤30 min · `S` ≤2 h · `M` ≤1 day. An `L` splits; an `XL` is
  refused. Also keep the diff **≤ ~400 LOC** (the Runs `Slice size` flag) — larger reviews collapse.
- A task is correctly scoped when it ships in **one** `/sdd:implement` session with a **single
  verifiable outcome**. Bigger → split; smaller → merge.
- **Autonomy** is the 5-level scale (Operator → Observer), set from ambiguity × irreversibility —
  low for irreversible / data-destructive work. See `@.claude/sdd/property-contract.md`.
- **Decisions** made mid-task go in the git commit `Decision:` paragraph — never a Notion change-log.
