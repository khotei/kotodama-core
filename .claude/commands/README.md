# SDD command toolkit — quickstart

The `/sdd:*` commands run the Spec-Driven Development loop inside Claude Code, reading and writing
the **live feature in Notion**. They are **compiled from** the
[SDD playbook](https://www.notion.so/36dfb28bd5f181238a86d26457bc24e7) (the authored source) — this
file is a thin index, **not** a copy. Canonical why/how lives in the playbook §7; the build
conventions live in `@.claude/rules/sdd.md`.

## The loop

`research?` → **specify → clarify → plan → tasks → implement → verify**

`/sdd:research` is optional pre-work; the spine is specify → … → verify. Each command ends by naming
the next.

## Commands

| Command | Phase | What it does | Playbook |
|---|---|---|---|
| `/sdd:research "<topic>"` | Research | deep, source-grounded findings → a cited Research page (Specs DB) | §1.5 |
| `/sdd:specify "<idea>"` | 1 Specify | fills the §6.1 template → a Drafted Feature row (EARS ACs) | §7.2 |
| `/sdd:clarify F-NNN` | 2 Clarify | grill-me: resolve every `[TBD]`, one question at a time | §7.3 |
| `/sdd:plan F-NNN` | 3 Plan | deep-module decomposition + testing strategy → Plan toggle | §7.4 |
| `/sdd:tasks F-NNN` | 4 Tasks | vertical slices → kanban rows (after you approve the breakdown) | §7.5 |
| `/sdd:implement <task>` | 5 Implement | TDD one task to Done; commit per `commits.md` | §7.6 |
| `/sdd:verify F-NNN` | 6 Verify | fresh-context AC check + Definition of Done → Verify report; `Status=Done` | §7.7 |

## How they run (fork map)

- **Forked** (fresh, tool-restricted subagent): `research`, `specify`, `plan`, `verify`.
- **Main context** (must pause for you): `clarify` (Q&A), `tasks` (approval), `implement` (HITL gate).

Why: `AskUserQuestion` and mid-run pauses aren't available to subagents, so the interactive phases
can't fork. Full rationale + the agent tool-restriction model: `@.claude/rules/sdd.md`.

## Embed vs link

Each command **embeds** the stable parts — the recipe, the relevant template, the §4 property
contract, and the `collection://` data-source IDs (shared in `.claude/sdd/`, `@`-referenced) — and
**fetches only the volatile content** (specs to cite, personas, current max ID, the feature/task
body) live from Notion. So a command still works with the playbook page renamed or moved.

## Cadence

Per-feature **start**: run specify → tasks in one sitting. Per-feature **end**: run verify. Full
rhythm in the playbook §11 (operating cadence).

## Requirements

The **Notion MCP must be connected** — the commands read/write Notion. If it isn't, a command says
so; connect it and re-run. There is no committed `.mcp.json`; the agents inherit whatever Notion
connector is active (see `@.claude/rules/sdd.md`).
