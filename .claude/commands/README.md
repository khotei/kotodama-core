# SDD command toolkit — quickstart

The `/sdd:*` commands run the Spec-Driven Development loop inside Claude Code, reading and writing
the **live feature in Notion**. They are **compiled from** the Kotodama agent-loop model — the hub
pages (the project-overview page + the "Notion PM Setup" playbook) and the agent-loop guide
[working-with-agents.md](https://github.com/khotei/terminal-stack/blob/main/docs/working-with-agents.md)
— this file is a thin index, **not** a copy. The build conventions live in `@.claude/rules/sdd.md`.

The Notion hub is **four databases**: **Knowledge** (the curated "why" — read, human-promoted), **Work** (Feature ▸ Task
in one DB via native sub-items), **Runs** (the audit unit — one row per delegation attempt), and
**Agents** (the fleet). Notion = the "why" + review surface; the repo = the "how" (decisions in git
commit `Decision:` paragraphs, never a Notion change-log).

## The loop

**specify → clarify → plan → tasks → implement → verify**

Each command ends by naming the next. `/sdd:specify` opens with evidence-gathering (formerly a
separate research phase) and emits the Feature **+ a linked research Spike**.

## Commands

| Command | Phase | What it does |
|---|---|---|
| `/sdd:specify "<idea>"` | 1 Shape | gather evidence + fill the feature template → a Shaped Feature (EARS ACs) + a linked research Spike |
| `/sdd:clarify KO-N` | 2 Clarify | grill-me: resolve every `[TBD]`, one question at a time |
| `/sdd:plan KO-N` | 3 Plan | deep-module decomposition + testing strategy → Plan toggle |
| `/sdd:tasks KO-N` | 4 Tasks | vertical slices → Task sub-items (after you approve the breakdown) |
| `/sdd:implement <task>` | 5 Implement | TDD one task to `Needs review`; commit per `commits.md`, emit a Run |
| `/sdd:verify KO-N` | 6 Verify | fresh-context AC check + Definition of Done → Run Verdict; the **human** Accepts (`Done`) or Returns |

Statuses on the Work row: `Backlog → Shaped → In progress → Needs review → Done / Returned`. An
agent never sets `Done` — verify is a **human gate**, and the **Run** is the audit unit it acts on.

## How they run (fork map)

- **Forked** (fresh, tool-restricted subagent): `specify`, `plan`, `verify`.
- **Main context** (must pause for you): `clarify` (Q&A), `tasks` (approval), `implement`
  (low-Autonomy gate).

Why: `AskUserQuestion` and mid-run pauses aren't available to subagents, so the interactive phases
can't fork. Full rationale + the agent tool-restriction model: `@.claude/rules/sdd.md`.

## Embed vs link

Each command **embeds** the stable parts — the recipe, the relevant template, the property
contract, and the `collection://` data-source IDs (shared in `.claude/sdd/`, `@`-referenced) — and
**fetches only the volatile content** (Knowledge docs to cite, personas, the feature/task body) live
from Notion. So a command still works with a hub page renamed or moved.

## Cadence

Per-feature **start**: run specify → tasks in one sitting. Per-feature **end**: run verify. Full
rhythm in the project-overview page (operating cadence).

## Requirements

The **Notion MCP must be connected** — the commands read/write Notion. If it isn't, a command says
so; connect it and re-run. There is no committed `.mcp.json`; the agents inherit whatever Notion
connector is active (see `@.claude/rules/sdd.md`).
