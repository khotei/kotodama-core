# SDD command & agent toolkit — conventions

The `/sdd:*` slash commands + their subagents are the **compiled, runnable form** of the
[SDD playbook](https://www.notion.so/36dfb28bd5f181238a86d26457bc24e7) (the authored source).
This file is the build contract every `commands/sdd:*.md` + `agents/*.md` follows. It is loaded
**on demand** (referenced when authoring or running the toolkit), not in the always-loaded block —
keep it that way so unrelated sessions don't pay for it. Feature: F-PLAT-006.

> **The playbook stays canonical; the commands are generated from it.** Any `/sdd:` change is
> two steps: edit the playbook §6/§7/§8, then regenerate the affected command(s). Do not let a
> command's content drift from its source section.

## File layout & naming

- **Commands are flat** in `.claude/commands/` with **literal-colon filenames** —
  `sdd:specify.md` → invokes as `/sdd:specify` (command name = filename without extension; the
  colon is just a character). Confirmed creatable on the repo's APFS; macOS/Linux only, which is
  fine (Bun + Linux CI). **Never nest** under `commands/<dir>/` — subdirectory namespacing is
  undocumented for commands.
- **Agents are flat** in `.claude/agents/` — `spec-author.md`, `planner.md`, etc.
- **Shared contract bundle** lives in `.claude/sdd/` — a **non-command** folder, so its files
  never register as slash commands: `feature-template.md` (§6.1), `task-template.md` (§6.2),
  `property-contract.md` (§4), `data-sources.md` (the `collection://` IDs).

## The re-sync header (every command + bundle file)

Each generated file begins with:

```
<!-- Generated from SDD playbook §X — <playbook-link>. Re-sync on change. -->
```

It points a future reader back at the authored source so a hand-edit can be reconciled.

## Anti-drift: `@`-reference the bundle, never inline

The §6.1 template, the §4 property contract, and the `collection://` IDs live in **one** place —
`.claude/sdd/`. Every command `@`-references those files (`@.claude/sdd/feature-template.md`)
instead of copy-pasting them into seven commands. **The single shared file is the real drift
defense**; the re-sync header just points back at the playbook.

## Tool boundaries live on the AGENT, never the command

- A command's **`allowed-tools` GRANTS / pre-approves** permission — it does **not restrict**
  which tools are available (Claude Code docs: *"It does not restrict which tools are available"*).
  So never lean on a command's `allowed-tools` for a "refuses to X" guarantee.
- The **only** hard tool boundary is the **subagent**. Two mechanisms, per the current Claude Code
  docs:
  - **`tools:`** — an *allowlist*: the agent may use **only** those tools. Anything unlisted
    (including connected MCP tools) is denied.
  - **`disallowedTools:`** — a *denylist*: the agent inherits everything from the main session
    **except** the named tools.
- **LexiAI uses `disallowedTools` for the "refuses to write code" agents** (spec-author, planner,
  task-splitter, researcher, verifier): e.g. `disallowedTools: Edit, Write, NotebookEdit` (add
  `Bash` for the non-implementer agents). **Decision — why denylist, not an allowlist:** the hard
  boundary we care about is "cannot touch code." A denylist expresses exactly that **and** lets the
  agent **inherit the connected Notion MCP under whatever name it has** — so no agent file hardcodes
  the per-connection server id. An allowlist would force us to *name* every kept tool, including
  `mcp__<server>__*`, which only has a stable name behind a committed `.mcp.json`. We deliberately
  **do not** commit a `.mcp.json` (F-PLAT-006: dropped from T01) — agents stay portable by never
  naming the Notion server. The implementer (which legitimately writes code) gets no code denial,
  only the scope discipline in its prompt.

## The fork map (which phases fork, which run in the main context)

A phase command runs in a forked subagent by setting, in frontmatter, **`context: fork`** +
**`agent: <subagent>`** — the command body becomes the subagent's prompt in a **fresh context**.
Forking is what gives `/sdd:verify` its fresh-context verifier (no memory of how the feature was
built) and what enforces a no-code agent's tool restriction.

**But forking is not universal — interactive phases cannot fork.** Verified against the current
Claude Code docs: **`AskUserQuestion` is unavailable to subagents** (so are `Agent`,
`EnterPlanMode`, `ExitPlanMode`, `ScheduleWakeup`, `WaitForMcpServers`), and a forked subagent runs
to completion — it structurally cannot pause mid-run for the user's input. So any phase that must
ask the user something while it runs has to live in the **main context**.

| Phase command | Runs in | Why |
|---|---|---|
| `/sdd:research` | **fork** → `researcher` | autonomous; clean tool-restricted context |
| `/sdd:specify` | **fork** → `spec-author` | autonomous draft; enforce no-code |
| `/sdd:clarify` | **main context** | grill-me `AskUserQuestion` loop — can't fork |
| `/sdd:plan` | **fork** → `planner` | autonomous; enforce no-code |
| `/sdd:tasks` | **main context** | presents the breakdown and iterates to *approval* |
| `/sdd:implement` | **main context** | HITL gate + spec-gap STOP both pause for the human |
| `/sdd:verify` | **fork** → `verifier` | fresh context is the whole point (AC-7) |

**Main-context phases still adopt their agent's discipline** by `@`-referencing the agent file
(`@.claude/agents/<agent>.md`) for the recipe + stated boundaries — they just can't get the *hard*
tool-lock a fork gives. That's acceptable: these are the human-in-the-loop phases where the user is
actively supervising. (`/sdd:implement` is the code-writer anyway, so it has no "no-code" lock to
lose.)

## Notion-at-runtime degradation

The commands fetch live content from the Notion MCP. If it is not connected, the fetch fails and
Claude says so — connect Notion, then re-run. Each command should also degrade gracefully: if
Notion is unavailable, fall back to "paste the spec/task body" and still run from its embedded
recipe. (Connecting Notion needs no repo config — there is no committed `.mcp.json`; see above.)

## Artifacts are Notion-only

Deliberate divergence from the playbook §1.4/§3, which also writes local `specs/F-NNN-slug/`
mirrors (`spec.md` / `plan.md` / `tasks.md`). LexiAI writes **only** to Notion (Feature row,
Research page, Task rows on the board, Verify report toggle). Recorded so a future reader doesn't
"restore" the folder.

## AC notation: EARS only

Specs/feature ACs use **EARS** — *WHEN \<event\> THE SYSTEM SHALL \<behavior\>* (also WHILE /
WHERE / IF–THEN). Do **not** mix in Gherkin's *Given/When/Then* — it is a different system.
Standardise on EARS across `/sdd:specify` and the feature template.

## Command ↔ agent ↔ source map

| Command | Agent | Restriction | Playbook source |
|---|---|---|---|
| `/sdd:research` | `researcher` | denylist: no code writes | §1.5 (grounding) |
| `/sdd:specify` | `spec-author` | denylist: no code writes | §6.1, §7.2, §4 |
| `/sdd:clarify` | `spec-author` (reused) | denylist: no code writes | §7.3 |
| `/sdd:plan` | `planner` | denylist: no code writes | §6.3, §7.4 |
| `/sdd:tasks` | `task-splitter` | denylist: no code writes | §6.2, §7.5, §4 |
| `/sdd:implement` | `implementer` | full tools (writes code) | §7.6 |
| `/sdd:verify` | `verifier` | denylist: no code writes; fresh ctx | §7.7, §8, §5 |
