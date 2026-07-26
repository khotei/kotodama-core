<!-- Notion property contract for the /sdd:* writes. Model owner: «Playbook — Notion PM Setup» (the field glossary). Re-sync on change. -->

# Notion property contract

When a `/sdd:*` command creates or updates rows via the Notion MCP, these field values are the
**structured contract** the rest of the loop relies on — a missing field is a defect. Data-source
IDs to write against live in `@.claude/sdd/data-sources.md`. The hub is four databases; the loop
**writes** to three (Work, Runs, Knowledge) and **reads** the fourth (Agents).

## Work item (Work DB) — one DB, Feature ▸ Task via sub-items

A **Feature** and its **Tasks** are the same database, distinguished by `Type` and linked by the
native **Parent item / Sub-items** self-relation. There is **no** separate Tasks DB.

**Shared fields**

- **`Title`** — short imperative. Tasks prefix the slice number ("T3 · loader — library.loader.ts").
- **`Type`** — `Feature` · `Task` · `Spike` · `Bug` · `Chore` · `Refactor`.
- **`Status`** — `Backlog` → `Shaped` (after Specify/Plan) → `In progress` (Implement) →
  `Needs review` (a Run is emitted, awaiting the human verdict) → `Done` (human Accept) /
  `Returned` (human Return). **An agent never sets `Done` itself.**
- **`Priority`** — `P0` · `P1` · `P2` · `P3`.
- **`Persona`** — one or more of `Learner` · `Creator` · `Contributor` (multi-select).

**Feature-level**

- **`Appetite`** — `Small (1-2d)` · `Batch (1-2w)`: how much the work is *worth* (a budget, not an
  estimate). If the work outgrows it, cut scope — don't extend the budget.
- **`Outcome`** — the observable Definition-of-Done statement (mirrors the feature spec's Outcomes).
- **`Knowledge`** — relation to the Knowledge doc(s) that justify the feature (product "why",
  research, personas).
- **`Progress`** — **rollup** (percent of Task sub-items `Done`). Auto — never set by hand; empty on
  a leaf Task is correct, not a bug.

**Task-level** (a sub-item of its Feature)

- **`Parent item`** — the Feature this task slices (the sub-item link; not a cross-DB relation).
- **`Estimate`** — `XS` (≤30 min) · `S` (≤2 h) · `M` (≤1 day). **XS–M only** — `L` splits, `XL` is
  refused. Also size against the **≤400 LOC** slice signal (see Runs `Diff LOC`).
- **`Autonomy`** — the leash for this task (see the Autonomy scale below).
- **`Blocks` / `Blocked by`** — the dependency graph. Publish rows **blockers-first** so
  `Blocked by` can reference real URLs.
- **`Runs`** — reverse relation to the Run rows this task produced (auto-populated from Runs).

**Computed — never set by hand:** `Progress` (rollup), `Done?` (formula `Status == Done`).
**Removed** (do not set — the field no longer exists): `Area`, `Sprint`, `Due date`,
`Target release`, `Linked specs`, `Verdict`. The verdict lives on the **Run**; the "how" (specs,
architecture) lives in the **repo**.

## Autonomy scale (Task `Autonomy`) — replaces the old AFK/HITL binary

Pick from the task's **ambiguity × irreversibility**; trust grows by earned accept-rate (Agents DB).

- **Operator** — the human approves every action.
- **Collaborator** — plan and execution are shared.
- **Consultant** — the agent plans; the human edits from the top.
- **Approver** — the agent runs solo; the human is touched only on blockers.
- **Observer** — full autonomy, with an emergency stop + log.

Default low for irreversible / data-destructive work; raise it as the agent earns trust. Autonomy
governs the *middle* (plan + execute) — it **never** bypasses the human review gate at Verify.

## Run row (Runs DB) — the audit unit, one row per delegation attempt

Created by `/sdd:implement`, resolved by `/sdd:verify`. A `Return` → re-delegate makes a **new**
Run — read the latest for current evidence.

- **`Title`** — "<task> · run N".
- **`Task`** — relation to the Work Task this run implements.
- **`Agent`** — relation to the Agents row that ran it.
- **`Verdict`** — `Needs review` (default, awaiting the human) → `Accepted` / `Returned` (the
  human's gesture at Verify).
- **`Handoff`** — the results summary a reviewer reads (~1–2k tokens): what changed + why.
- **`Evidence`** — URL to the proof (PR / diff / CI run). Evidence, not assertion.
- **`Diff LOC`** — the slice size. `Slice size` (formula) flags `> 400 LOC` — the #1 scope-creep tell.
- **`Branch`** — the git branch / worktree, so `git diff main..branch` is one click.
- **`Cost (tokens)`** — the run's token cost.

**Computed — never set by hand:** `Slice size` (formula), `Accepted?` (formula — feeds the Agents
accept-rate).

## Knowledge doc (Knowledge DB) — `/sdd:research` target

- **`Title`** — "Research findings — <topic>".
- **`Doc type`** — `Research` (the research phase). Other docs: `Product brief` · `Personas` ·
  `Playbook` · `Onboarding`.
- **`Status`** — `Draft` → `Verified` → `Stale` (a freshness flag, not a workflow state).
- **`Re-verify by`** — the wiki review date (optional).

## Agents row (Agents DB) — read-only for the loop

Read to pick an agent and gauge trust; the loop does **not** create these.

- **`Owns` / `Refuses`** — the role's scope. **`Max autonomy`** — the ceiling it may be granted.
- **`Accept rate`** (rollup) / **`Total runs`** (rollup) — earned trust from its Runs.

## Body-level (not a property)

Every **Task** body carries a **Context Pack** (Goal · Hard AC ids · in/out boundaries · no
mid-task rescoping · linked files & playbooks · Autonomy) and, once run, an **Evidence** section.
See `@.claude/sdd/task-template.md`. Decisions go in the git commit `Decision:` paragraph — **never**
a Notion change-log.
