---
paths:
  - ".claude/commands/**"
  - ".claude/agents/**"
  - ".claude/sdd/**"
---

# SDD command & agent toolkit — the build contract

The `/sdd:*` commands + their subagents are the **compiled, runnable form** of the Kotodama
agent-loop model, owned by the Notion hub pages (project overview + the "Notion PM Setup" playbook)
and the agent-loop guide
([working-with-agents.md](https://github.com/khotei/terminal-stack/blob/main/docs/working-with-agents.md)).
This file is the contract for **editing** that toolkit (it never loads in normal work sessions).
**Any `/sdd:` change is two steps: settle it in the hub/guide first, then reconcile the affected
command(s)** — a command never drifts from the model it encodes. Every generated file keeps its
`<!-- Compiled from … Re-sync on change. -->` header pointing back at the model owners.

## The shape every command protects

The loop is **Frame → Delegate → Verify → Comprehend**; the scarce resource is the human's
comprehension, not agent tokens:

- **The contract goes first** — ACs/tests before the fill (`/sdd:implement` writes the failing test
  first).
- **The heavy review lands once, on the plan** — a reviewed contract surface; tasks only conform.
- **Compose over create** — a feature is mostly composition of existing primitives (library first,
  then the repo's own vocabularies); new logic is written composably on top, and a shared
  abstraction is extracted late (rule of three). The `planner` runs this as a beat.
- **Each slice stays under ~400 LOC** — or it's two tasks.
- **Verification is evidence, not assertion** — a fresh `verifier` records the Verdict on a **Run**;
  every code-producing run records a Run + Evidence (PR / diff / CI on the Run, never prose).

## Layout gotchas (the model gets these wrong)

- Commands are **flat** in `.claude/commands/` with **literal-colon filenames** (`sdd:specify.md` →
  `/sdd:specify`; the colon is just a character — confirmed creatable on this repo's APFS).
  **Never nest** under `commands/<dir>/` — subdirectory namespacing is undocumented for commands.
- Agents are flat in `.claude/agents/`. The shared bundle (templates, `property-contract.md`,
  `data-sources.md`) lives in `.claude/sdd/` — a **non-command** folder, so its files never
  register as slash commands.
- **`@`-reference the bundle, never inline** — templates, the property contract, and the
  `collection://` IDs have ONE home; commands `@`-reference them
  (`@.claude/sdd/feature-template.md`). The single shared file is the real drift defense.

## Tool boundaries live on the AGENT, never the command

- A command's `allowed-tools` **grants/pre-approves** permission — it does **not restrict** which
  tools are available. The only hard boundary is the subagent's: **`tools:`** is an allowlist
  (anything unlisted, MCP included, is denied); **`disallowedTools:`** is a denylist (inherit
  everything except the named).
- **Decision — the no-code agents use `disallowedTools`** (`Edit, Write, NotebookEdit` + `Bash`):
  it expresses exactly "cannot touch code" AND inherits the connected Notion MCP under whatever
  name it has. An allowlist would force naming `mcp__<server>__*`, which is only stable behind a
  committed `.mcp.json` we deliberately don't have (F-PLAT-006) — agents stay portable by never
  naming the Notion server.

## The fork map

Forking (frontmatter `context: fork` + `agent: <subagent>`) gives a fresh context + the hard tool
lock — but **`AskUserQuestion` (and `Agent`, `EnterPlanMode`, `ExitPlanMode`…) are unavailable to
subagents**, and a forked run cannot pause mid-run, so interactive phases run in the **main
context**, adopting their agent's discipline by `@`-referencing the agent file (a soft boundary —
acceptable: those are the phases the human actively supervises).

| Command | Agent | Runs in | Why |
|---|---|---|---|
| `/sdd:specify` | `spec-author` | fork | autonomous; no-code lock |
| `/sdd:clarify` | `spec-author` (reused) | main | `AskUserQuestion` grill loop can't fork |
| `/sdd:plan` | `planner` | fork | autonomous; no-code lock |
| `/sdd:tasks` | `task-splitter` | main | iterates to the user's approval |
| `/sdd:implement` | `implementer` | main | low-Autonomy gate + spec-gap STOP pause for the human |
| `/sdd:verify` | `verifier` | fork | fresh context IS the point |

If the Notion MCP isn't connected, a command says so and degrades to "paste the spec/task body"
(no repo config involved — there is no committed `.mcp.json`).

## The why/how boundary (don't re-litigate)

**Notion carries the "why" + the review surface** (the Feature row, Task sub-items, the research
Spike, the Plan toggle); **the repo carries the "how"** — never mirror a local `specs/F-NNN-slug/`
folder, and every non-obvious choice goes in a git commit `Decision:` paragraph, **never** a Notion
change-log. ACs use **EARS only** (*WHEN \<event\> THE SYSTEM SHALL \<behavior\>*; also
WHILE / WHERE / IF–THEN) — never Gherkin's *Given/When/Then*.
