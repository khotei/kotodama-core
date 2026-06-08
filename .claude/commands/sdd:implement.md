---
description: "Phase 5 (Implement): TDD one task to Done — failing test first, scoped, commit per commits.md"
argument-hint: "<task-id or task URL>"
---

<!-- Generated from SDD playbook §7.6 — https://www.notion.so/36dfb28bd5f181238a86d26457bc24e7. Re-sync on change. -->

You are running **Phase 5 (Implement)** of the LexiAI SDD playbook on task `$ARGUMENTS`.

**Adopt the implementer discipline** (`@.claude/agents/implementer.md`): Autonomy gate, failing test
first, stay scoped, living spec, respect the repo rules, commit per `@.claude/rules/commits.md`.

> **This phase runs in the main context — NOT a forked subagent** — so the HITL gate and the
> spec-gap STOP can pause for you. See `@.claude/rules/sdd.md` (fork map).

## Steps

1. **Autonomy gate.** Fetch the task `$ARGUMENTS` and read its `Autonomy`. If `HITL`, surface the
   decision or review it needs and get the human's call **before** writing code; if `AFK`, proceed.
   Move the task to `Status = In progress`.
2. **Read the context.** The parent Feature spec (linked from the task), the relevant Tech/Design
   spec sections, and the task's `Covers ACs:` list. Resolve open questions from the specs +
   `lexi-ai/` code before asking the user.
3. **Write the failing test first** (happy + failure path), confirm it fails, **then** implement to
   green. Some chores have no meaningful unit test — judge the value rather than force one, and say
   so if you skip it.
4. **Stay scoped.** Implement only this task. File a **new Tasks-DB row** for any unrelated bug or
   improvement you find — don't fix it inline.
5. **Living spec.** If implementation reveals a spec gap, **STOP** — add a change-log row to the
   feature page, propose the spec change, and get the user's confirmation before continuing.
6. **Finish.** When every AC in `Covers ACs:` passes and `bun run check` + `bun run test` are green,
   commit per `@.claude/rules/commits.md` (`Refs: <task URL>`), set the task `Status = Done`, and —
   if it's the last task in the feature — propose `/sdd:verify <feature-id>`.

## Do not

- Do **not** start a task whose `Blocked by` tasks aren't `Done`.
- Do **not** widen scope, invent requirements, or `git commit --no-verify` on `main`.
