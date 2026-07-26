---
description: "Phase 4 (Tasks): split the Plan into Autonomy-tagged Task sub-items (after you approve the breakdown)"
argument-hint: "KO-N"
---

<!-- Compiled from the Kotodama Notion hub («О системе» + «Playbook — Notion PM Setup») + the agent-loop guide github.com/khotei/terminal-stack/blob/main/docs/working-with-agents.md. Re-sync on change. -->

You are running **Phase 4 (Tasks)** of the Kotodama SDD loop on `$ARGUMENTS`.

**Adopt the task-splitter discipline** (`@.claude/agents/task-splitter.md`): vertical tracer-bullet
slices, XS–M only, a recon `Spike` first for any unknown/legacy shape, no code, approval before rows.

> **This phase runs in the main context — NOT a forked subagent.** Step 3 presents the breakdown and
> iterates to *your* approval, which a subagent can't do. See `@.claude/rules/sdd.md` (fork map).

**Embedded — do NOT fetch from Notion:** the task template `@.claude/sdd/task-template.md`, the
property contract `@.claude/sdd/property-contract.md`, and the data-source IDs
`@.claude/sdd/data-sources.md` (the Work collection id lives there).
**Fetch live:** the feature's Plan toggle + acceptance criteria (the page body).

## Steps

1. **Read the feature's Plan + ACs** (`$ARGUMENTS`). Each plan step maps to one or more tasks.
2. **Draft vertical tracer-bullet slices** by default — each cuts through every layer it touches
   and is demoable on its own. Prefer many thin slices. Horizontal (single-layer) tasks only for
   foundational/platform work where a vertical slice is impossible. Front any unknown/legacy shape
   with a recon `Spike`; in existing code pin current behavior with a characterization test first.
3. **Present the breakdown FIRST** as a numbered list — *title · Autonomy · Estimate · Blocked-by ·
   Hard AC* — and ask whether granularity, dependencies, and Autonomy splits are right. **Iterate
   until the user approves. Do not write any sub-items yet.**
4. **On approval, create one Task sub-item per slice** under the parent Feature in the Work DB
   (data-source id from `@.claude/sdd/data-sources.md`) — set `Type = Task` and `Parent item` to the
   Feature (native sub-item, NOT a separate Tasks DB) — **publishing blockers-first** so each
   `Blocked by` references a real task URL (Notion mirrors the reciprocal `Blocks`). Use
   `@.claude/sdd/task-template.md` for the body and include a `Hard AC:` line mapping the task to
   the feature's AC IDs.
5. **Set every required field** per `@.claude/sdd/property-contract.md`: `Title` (`T<n> · …`,
   imperative, single outcome), `Type = Task`, `Parent item`, `Priority`, `Status = Shaped`,
   `Estimate` (**XS–M only** — `L` splits, `XL` refuses; also keep the slice **≤400 LOC** as a
   guideline — a Drizzle schema + its migration + the test that covers it is one legitimate slice
   even when it runs larger, since the migration is genuine "how"), `Autonomy` (the 5-level scale —
   Operator → Collaborator → Consultant → Approver → Observer), and `Blocks`/`Blocked by` edges.
6. **Validate:** every plan step maps to ≥1 slice; every task has a single demoable outcome, a
   `Hard AC:` line, an Autonomy tag, and no `L`/`XL` estimate.
7. **End with one line:** `Tasks created: <N> (autonomy mix: <e.g. 3 Approver / 1 Operator>). Critical path: T1 → T2 → … Next: /sdd:implement <first unblocked task>.`

## Do not

- Do **not** create any sub-item before the user approves the breakdown.
- Do **not** write code, or use `L`/`XL` estimates.
- Do **not** fetch the template / contract / data-source IDs from Notion — they're embedded above.
