<!-- Generated from SDD playbook §4 — https://www.notion.so/36dfb28bd5f181238a86d26457bc24e7. Re-sync on change. -->

# Notion property contract (§4)

When a `/sdd:*` command creates rows via the Notion MCP, these field values are **not optional** —
they are the structured contract the rest of the loop relies on. A missing field is a defect.
Data-source IDs to create against live in `@.claude/sdd/data-sources.md`.

## Feature row (Features DB)

- **`Feature ID`** — `F-AREA-NNN` (sequential, no gaps; check the current max in the DB first).
- **`Title`** — short imperative form ("Audio pronunciation").
- **`Area`** — exactly one of: Input · Content · Memory · Growth · Monetization · Platform ·
  Personalization · Trust.
- **`Priority`** — `P0 / Must` · `P1 / Should` · `P2 / Could` · `P3 / Won't`.
- **`Status`** — starts `Backlog` → `Drafted` (after Specify) → `In design` (after Plan) →
  `In build` (during Implement) → `In review` (during Verify) → `Done`.
- **`Persona`** — one or more from the persona enum; **never empty** (multi-select).
- **`Target release`** — `MVP` · `Q3 2026` · `Q4 2026` · `Post-MVP` · `Backlog`.
- **`Linked specs`** — relation to the Product / Tech / Design / Research specs that justify the
  feature.

## Task row (Tasks DB)

- **`Title`** — imperative, single outcome, prefixed with the task number ("T03 — Add
  `pronunciation_url` column to `user_words`").
- **`Type`** — `Feature work` · `Bug` · `Chore` · `Spike` · `Refactor`.
- **`Priority`** — `P0` · `P1` · `P2`.
- **`Status`** — starts `Not started`; → `In progress` when an agent picks it up; back to
  `Not started` if abandoned mid-session; → `Done` **only after** the AC is verified.
- **`Sprint`** — a **relation** to the Sprints DB (optional). The live Tasks DB models Sprint as a
  relation, **not** the playbook §4's `This week / Next week / Later` select — leave it **unset** at
  creation unless you're actively scheduling. The kanban groups by `Status` regardless.
- **`Estimate`** — `XS` (≤30 min) · `S` (≤2 h) · `M` (≤1 day). **XS–M only** — `L` splits, `XL`
  is refused.
- **`Feature`** — relation to exactly one Feature row.
- **`Blocks` / `Blocked by`** — wire the dependency graph; missing edges make the loop pick tasks
  out of order. Publish rows **blockers-first** so `Blocked by` can reference real task URLs.
- **`Due date`** — only set when `Sprint` = `This week` or `Next week`.
- **`Autonomy`** — `AFK` (agent implements + merges unattended) · `HITL` (needs a human decision
  or design review first). Default `AFK`; mark `HITL` only for a real human gate.

## Body-level (not a property)

Every task body carries a **`Covers ACs:`** line mapping it to the feature's AC IDs (`AC-1, AC-3`),
so traceability survives outside the property panel. See `@.claude/sdd/task-template.md`.
