---
description: "Phase 5 (Implement): TDD one task to Needs review — failing test first, scoped, commit + emit a Run"
argument-hint: "<task-id or task URL>"
---

<!-- Compiled from the Kotodama Notion hub + the agent-loop guide github.com/khotei/terminal-stack/blob/main/docs/working-with-agents.md. Re-sync on change. -->

You are running **Phase 5 (Implement)** of the Kotodama SDD loop on task `$ARGUMENTS`.

**Adopt the implementer discipline** (`@.claude/agents/implementer.md`): Autonomy gate, failing test
first, stay scoped, living spec, respect the repo rules, commit per `@.claude/rules/commits.md`.

> **This phase runs in the main context — NOT a forked subagent** — so the Autonomy gate and the
> spec-gap STOP can pause for you. See `@.claude/rules/sdd.md` (fork map).

## Steps

1. **Autonomy gate.** Fetch the task `$ARGUMENTS` and read its `Autonomy` on the 5-level scale — a
   low level (Operator: approve every action · Collaborator: shared plan+execution · Consultant:
   agent plans, human edits from the top) needs the human's call **before** writing code; a high one
   (Approver: solo, human only on blockers · Observer: full autonomy + emergency stop) proceeds
   unattended. Move the task to `Status = In progress`.
2. **Read the context.** The parent Feature spec (the task's `Parent item`), the relevant Knowledge
   docs, the `kotodama-core/` code, and the task's `Hard AC:` list. Resolve open questions from
   Knowledge + the repo before asking the user.
3. **Write the failing test first** (happy + failure path), confirm it fails, **then** implement to
   green. Some chores have no meaningful unit test — judge the value rather than force one, and say
   so if you skip it. In existing/legacy code, pin current behavior with a characterization test
   before you refactor.
4. **Stay scoped.** Implement only this task. File a **new Work sub-item** (under the same Feature)
   for any unrelated bug or improvement you find — don't fix it inline. Isolate parallel agents in
   separate git worktrees so their slices review independently.
5. **Living spec.** If implementation reveals a spec gap, **STOP** — propose the spec change, get the
   user's confirmation, then record the decision in the commit's `Decision:` paragraph (never a
   Notion change-log) before continuing.
6. **Finish — hand off to the review gate.** When every AC in `Hard AC:` passes and `bun run check` +
   `bun run test` (**not** `bun test`) are green, commit per `@.claude/rules/commits.md`
   (`Refs: <task URL>`). Then **create a Run row** in the Runs DB (`Verdict = Needs review`,
   `Handoff` summary, `Evidence` URL, `Diff LOC`, `Branch`, `Cost`, `Agent` + `Task` relations) and
   set the Work task **`Status = Needs review`** — **never `Done`** (only a human Accept at
   `/sdd:verify` sets `Done`). Propose `/sdd:verify $ARGUMENTS`.

## Do not

- Do **not** start a task whose `Blocked by` tasks aren't `Done`.
- Do **not** set the task `Done` yourself — that's the human's gesture at Verify.
- Do **not** widen scope, invent requirements, or `git commit --no-verify` on `main`.
