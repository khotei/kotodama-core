---
description: "Research: deep, source-grounded findings written to a cited Research page in the Knowledge DB"
argument-hint: "<topic>"
context: fork
agent: researcher
---

<!-- Compiled from the Kotodama Notion hub + the agent-loop guide github.com/khotei/terminal-stack/blob/main/docs/working-with-agents.md. Re-sync on change. -->

You are running the **Research** phase of the Kotodama SDD loop on the topic `$ARGUMENTS`.
(The project constitution already exists as the repo-root `CLAUDE.md`, so this optional pre-Specify
step is evidence-gathering.)

**Embedded — do NOT fetch from Notion:** the data-source IDs `@.claude/sdd/data-sources.md` (the
Knowledge collection id lives there); the target is `Doc type = Research`.
**Fetch live:** the web sources, plus any existing Kotodama Knowledge docs / `kotodama-core/` code
that bear on the topic.

## Steps

1. **Scope** the topic `$ARGUMENTS` into the specific questions the research must answer.
2. **Gather evidence** from multiple sources — `WebSearch`/`WebFetch` for external, the Notion MCP +
   `Read`/`Grep` for internal Knowledge docs/code. Prefer primary/authoritative sources; triangulate.
   Prefer platform-native capabilities over hand-rolled approaches in what you surface — findings
   should present the best-in-class option, cited, not the naive default a later Plan would
   otherwise inherit.
3. **Ground every claim.** Each factual statement gets an inline citation to a real, retrievable
   source. A claim with no source **does not ship** — drop it or list it as an open question
   (invention is forbidden).
4. **Synthesise** into a Research-findings page: **summary**, **findings** (each cited), **open
   questions / gaps**, **sources**.
5. **Create the page** in the Knowledge DB (data-source id from `@.claude/sdd/data-sources.md`) with
   `Doc type = Research`, `Status = Draft`. Link related features if any apply.
6. **End with one line:** `Research page created: <title>. Findings: <n> (all cited). Link it as the /sdd:specify feature's Knowledge relation.`

## Do not

- Do **not** state a claim you can't cite — that's the AI-slop failure mode this phase exists to
  prevent.
- Do **not** write code (denied by tool policy anyway).
- Do **not** fetch the data-source IDs from Notion — they're embedded above.
