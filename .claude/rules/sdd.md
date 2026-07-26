---
paths:
  - ".claude/commands/**"
  - ".claude/agents/**"
  - ".claude/sdd/**"
---

# SDD command & agent toolkit — conventions

The `/sdd:*` commands + subagents are the **runnable, compiled form** of the
[SDD playbook](https://www.notion.so/36dfb28bd5f181238a86d26457bc24e7) (authored source), loaded on
demand. **Playbook stays canonical:** any `/sdd:` change = edit the playbook §6/§7/§8, then
regenerate the affected command — don't let a command drift from its source section.

## Layout & anti-drift

- **Commands flat** in `.claude/commands/`, **literal-colon filenames** (`sdd:specify.md` → `/sdd:specify`); **never nest** under a subdir (undocumented namespacing). **Agents flat** in `.claude/agents/`.
- **Shared contract bundle** in `.claude/sdd/` (a non-command folder): `feature-template.md`, `task-template.md`, `property-contract.md`, `data-sources.md`.
- Every generated file opens with `<!-- Generated from SDD playbook §X — <link>. Re-sync on change. -->`.
- **`@`-reference the bundle, never inline it** (`@.claude/sdd/feature-template.md`) — one shared file is the real drift defense.

## Tool boundaries — on the AGENT, never the command

A command's `allowed-tools` only pre-approves; it never restricts, so it is no "refuses to X"
guarantee. The hard boundary is the subagent. **No-code agents use `disallowedTools` (a denylist),
not an allowlist** — e.g. `disallowedTools: Edit, Write, NotebookEdit` (+`Bash` for non-implementers).
**Why denylist:** it lets the agent inherit the connected Notion MCP under whatever name it has, so
no agent file hardcodes a per-connection server id — we deliberately **do not commit a `.mcp.json`**.
An allowlist would force naming every kept `mcp__<server>__*`. The implementer writes code, so no denial.

## Forking & the phase map

A command forks by setting `context: fork` + `agent: <subagent>` in frontmatter — fresh context is
what gives the hard tool lock and the fresh-context verifier. **Interactive phases can't fork:** a
subagent can't call `AskUserQuestion` and runs to completion, so any phase that pauses for the user
lives in the main context (adopting its agent's discipline via `@`-ref, minus the hard lock).

| Command | Runs in | Agent | Restriction | Playbook |
|---|---|---|---|---|
| `/sdd:research` | fork | `researcher` | no code writes | §1.5 |
| `/sdd:specify` | fork | `spec-author` | no code writes | §6.1,§7.2,§4 |
| `/sdd:clarify` | main | `spec-author` | no code writes (grill-me loop) | §7.3 |
| `/sdd:plan` | fork | `planner` | no code writes | §6.3,§7.4 |
| `/sdd:tasks` | main | `task-splitter` | no code writes (approval loop) | §6.2,§7.5,§4 |
| `/sdd:implement` | main | `implementer` | full tools; HITL + spec-gap STOP | §7.6 |
| `/sdd:verify` | fork | `verifier` | no code writes; fresh ctx | §7.7,§8,§5 |

## Kotodama divergences from the playbook

- **Artifacts are Notion-only** — no local `specs/F-NNN-slug/` mirrors (§1.4/§3 writes them; we don't — don't "restore" the folder).
- **AC notation is EARS only** (*WHEN … THE SYSTEM SHALL …*); never mix in Gherkin's Given/When/Then.
- **Notion-at-runtime:** commands fetch live from the Notion MCP; if not connected, say so, then fall back to "paste the spec/task body" + the embedded recipe. No repo config needed (no `.mcp.json`).
