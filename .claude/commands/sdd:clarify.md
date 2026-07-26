---
description: "Phase 2 (Clarify): grill-me loop — resolve every [TBD] in a feature spec"
argument-hint: "KO-N"
---

<!-- Compiled from the Kotodama Notion hub + the agent-loop guide github.com/khotei/terminal-stack/blob/main/docs/working-with-agents.md. Re-sync on change. -->

You are running **Phase 2 (Clarify)** of the Kotodama SDD loop on `$ARGUMENTS`.

**Adopt the spec-author discipline** (`@.claude/agents/spec-author.md`): ground every claim in a
source, invent nothing, never write code, ACs in EARS, Notion-only artifacts.

> **This phase runs in the main context — NOT a forked subagent — on purpose.** The grill-me loop
> needs `AskUserQuestion`, and that tool (plus any mid-run pause for your input) is unavailable to
> subagents. So clarify is human-in-the-loop in the main thread; it borrows the spec-author *role*
> by reference, not as a hard tool-lock. See `@.claude/rules/sdd.md` (fork map).

**Goal:** drive `$ARGUMENTS` to **zero `[TBD]` blockers** — every unresolved decision either
answered (spec updated) or explicitly deferred.

## Steps

1. **Fetch the feature row** (`$ARGUMENTS`) from the Work DB and read it end to end.
2. **Walk the whole decision tree** — don't just collect existing `[TBD]`s. Surface every
   unresolved decision the spec implies, including assumptions the author never flagged.
3. **Self-answer first.** Before asking anything, try to resolve each question from the Knowledge
   docs and the `kotodama-core/` codebase (Read/Grep/Glob) — the repo is the source of truth for
   *how*. Only escalate what *genuinely* needs a human — product/intent calls, irreversible
   architecture choices.
4. **For every remaining question, recommend an answer.** Propose 2–3 options with trade-offs (cite
   Knowledge/repo) and state your recommendation. Never ask what the code or Knowledge already decide.
5. **Ask via `AskUserQuestion`.** One question at a time when a decision depends on the previous
   answer (each answer informs the next); batch only genuinely independent questions (≤4 per round).
   Put your recommended option **first**, suffixed `(Recommended)`.
6. **After each answer, update the spec inline** (Notion). Record the decision and *why* in the
   eventual commit's `Decision:` paragraph, never a Notion change-log.
7. **Exit at the gate:** zero `[TBD]` blockers in any AC, requirement, or dependency. Items may be
   explicitly deferred — mark them `[TBD — post-MVP]` (or similar) — but never leave one silent.
8. **End with one line:** `Clarify complete for $ARGUMENTS. Resolved: <n>, deferred: <m>. Next: /sdd:plan $ARGUMENTS.`

## Do not

- Do **not** write or run code — you're in the intent layer. If a question can only be answered by
  building something, it belongs in Plan/Implement; note it and move on.
- Do **not** silently pick an answer for a genuine human call — recommend, then ask.
