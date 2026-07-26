---
paths:
  - ".claude/commands/**"
  - ".claude/agents/**"
  - ".claude/sdd/**"
---

# SDD command & agent toolkit — conventions

The `/sdd:*` slash commands + their subagents are the **compiled, runnable form** of the Kotodama
agent-loop model — owned by the Notion hub pages (the project-overview page +
the "Notion PM Setup" playbook) and the agent-loop guide
([working-with-agents.md](https://github.com/khotei/terminal-stack/blob/main/docs/working-with-agents.md)).
This file is the build contract every `commands/sdd:*.md` + `agents/*.md` follows. It is loaded
**on demand** (referenced when authoring or running the toolkit), not in the always-loaded block —
keep it that way so unrelated sessions don't pay for it.

> **The hub + guide stay canonical; the commands are compiled from them.** Any `/sdd:` change is
> two steps: settle it in the hub / guide (the model), then reconcile the affected command(s). Do not
> let a command's content drift from the model it encodes. The boundary the model draws: **Notion =
> the "why" + the review surface; the repo = the "how"** (architecture and decisions), with decisions
> living in git commit `Decision:` paragraphs — never a Notion change-log.

## The loop every phase instantiates (why the commands are shaped this way)

SDD is one loop at two scales: **Frame → Delegate → Verify → Comprehend**. The six phases are that
loop at *feature* scale — `specify → … → verify` is the **Frame** beat one floor up (the plan is
where the whole picture exists before any code); each task then runs its own small turn of it. The
scarce resource is **your comprehension**, not the agent's tokens, so every command is built to
protect it — this is the *why* behind their shape:

- **The contract goes first** — ACs/tests committed before the fill (`/sdd:implement` writes the
  failing test first).
- **The heavy review lands once, on the plan** — a reviewed contract surface; tasks only conform.
- **Compose over create** — a feature is mostly composition of existing primitives (library first,
  then the repo's vocabularies); new logic is written composably on top, and a shared abstraction is
  extracted late (rule of three). The `planner` runs this as a beat.
- **Each slice stays under ~400 LOC** — or it's two tasks.
- **Verification is evidence, not assertion** — a fresh `verifier` re-checks behavior, records the
  Verdict on a **Run**, and feeds the human Accept/Return gate.

Engineer the durable; vibe-code only the throwaway (a spike, a prototype). The moment code must be
*evolved*, Verify and Comprehend come back on. Full rationale: the agent-loop guide
(`working-with-agents.md`) + the project-overview page.

## File layout & naming

- **Commands are flat** in `.claude/commands/` with **literal-colon filenames** —
  `sdd:specify.md` → invokes as `/sdd:specify` (command name = filename without extension; the
  colon is just a character). Confirmed creatable on the repo's APFS; macOS/Linux only, which is
  fine (Bun + Linux CI). **Never nest** under `commands/<dir>/` — subdirectory namespacing is
  undocumented for commands.
- **Agents are flat** in `.claude/agents/` — `spec-author.md`, `planner.md`, etc.
- **Shared contract bundle** lives in `.claude/sdd/` — a **non-command** folder, so its files
  never register as slash commands: `feature-template.md`, `task-template.md`, `plan-template.md`,
  `property-contract.md` (the Work/Runs/Knowledge/Agents field contract + the Autonomy scale),
  `data-sources.md` (the four `collection://` IDs).

## The re-sync header (every command + bundle file)

Each generated file begins with:

```
<!-- Compiled from the Kotodama Notion hub + the agent-loop guide github.com/khotei/terminal-stack/blob/main/docs/working-with-agents.md. Re-sync on change. -->
```

It points a future reader back at the model owners so a hand-edit can be reconciled.

## Anti-drift: `@`-reference the bundle, never inline

The templates, the property contract, and the `collection://` IDs live in **one** place —
`.claude/sdd/`. Every command `@`-references those files (`@.claude/sdd/feature-template.md`)
instead of copy-pasting them into seven commands. **The single shared file is the real drift
defense**; the re-sync header just points back at the model owners.

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
- **Kotodama uses `disallowedTools` for the "refuses to write code" agents** (spec-author, planner,
  task-splitter, verifier): e.g. `disallowedTools: Edit, Write, NotebookEdit` (add
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
| `/sdd:specify` | **fork** → `spec-author` | autonomous; gathers evidence + drafts the Feature (no-code) |
| `/sdd:clarify` | **main context** | grill-me `AskUserQuestion` loop — can't fork |
| `/sdd:plan` | **fork** → `planner` | autonomous; enforce no-code |
| `/sdd:tasks` | **main context** | presents the breakdown and iterates to *approval* |
| `/sdd:implement` | **main context** | low-Autonomy gate + spec-gap STOP both pause for the human |
| `/sdd:verify` | **fork** → `verifier` | fresh context is the whole point — it feeds the human gate |

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

## The why/how boundary — artifacts split by side

**Notion carries the "why" + the review surface; the repo carries the "how."** The `/sdd:*` loop
writes the "why" **only** to Notion — the Feature Work row, its Task sub-items, the research Spike
sub-item, the Plan toggle — and never mirrors a local `specs/F-NNN-slug/` folder (no
`spec.md` / `plan.md` / `tasks.md`). Architecture and decisions live in the **repo**: the code is
the source of truth for *how*, and every non-obvious choice goes in a git commit `Decision:`
paragraph, **never** a Notion change-log. Recorded so a future reader doesn't "restore" the folder or
reintroduce change-logs.

**Every code-producing run records a Run + Evidence.** `/sdd:implement` creates a **Runs** row per
delegation attempt (`Verdict = Needs review`, Handoff, Evidence URL, Diff LOC, Branch, Cost) — the
audit unit the human reviews at Verify. Evidence, not assertion: the proof (PR / diff / CI) lives on
the Run, not in prose.

## AC notation: EARS only

Specs/feature ACs use **EARS** — *WHEN \<event\> THE SYSTEM SHALL \<behavior\>* (also WHILE /
WHERE / IF–THEN). Do **not** mix in Gherkin's *Given/When/Then* — it is a different system.
Standardise on EARS across `/sdd:specify` and the feature template.

## Command ↔ agent ↔ role map

| Command | Agent | Restriction | Role in the model |
|---|---|---|---|
| `/sdd:specify` | `spec-author` | denylist: no code writes | Work Feature (`Shaped`) + a linked research Spike |
| `/sdd:clarify` | `spec-author` (reused) | denylist: no code writes | resolve every `[TBD]` on the Feature |
| `/sdd:plan` | `planner` | denylist: no code writes | Plan toggle on the Feature (deep modules) |
| `/sdd:tasks` | `task-splitter` | denylist: no code writes | Task sub-items under the Feature |
| `/sdd:implement` | `implementer` | full tools (writes code) | code + a Run, task → `Needs review` |
| `/sdd:verify` | `verifier` | denylist: no code writes; fresh ctx | AC check → Run Verdict; human Accept/Return gate |

The model owners are the hub pages and the agent-loop
guide (`working-with-agents.md`) — not a numbered playbook.
