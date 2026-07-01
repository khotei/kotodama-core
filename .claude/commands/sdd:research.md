---
description: "Research: deep, source-grounded findings written to a cited Research page in the Specs DB"
argument-hint: "<topic>"
context: fork
agent: researcher
---

<!-- Generated from SDD playbook §1.5 (grounding) + §4 — https://www.notion.so/36dfb28bd5f181238a86d26457bc24e7. Re-sync on change. -->

You are running the **Research** phase of the LexiAI SDD playbook on the topic `$ARGUMENTS`.
(This stands in for the playbook's phase-0 `/sdd:constitution` — the constitution already exists as
the repo-root `CLAUDE.md`, so the optional pre-Specify step here is evidence-gathering.)

**Embedded — do NOT fetch from Notion:** the data-source IDs `@.claude/sdd/data-sources.md` (the
Specs collection id lives there); the target is `Doc type = Research`.
**Fetch live:** the web sources, plus any existing LexiAI specs / `lexi-ai/` code that bear on the
topic.

## Steps

1. **Scope** the topic `$ARGUMENTS` into the specific questions the research must answer.
2. **Gather evidence** from multiple sources — `WebSearch`/`WebFetch` for external, the Notion MCP +
   `Read`/`Grep` for internal specs/code. Prefer primary/authoritative sources; triangulate. **Use both
   legs of the capability sweep as your search lens** (`@.claude/prompts/capability-sweep.md`): actively
   enumerate the best platform-native capabilities *and* the strongest design/structure options
   (`@.claude/agent-patterns/design-heuristics.md`) that bear on the topic — so the findings surface the
   best-in-class approach, cited, not just the naive/default one a later Plan would otherwise reach for.
3. **Ground every claim.** Each factual statement gets an inline citation to a real, retrievable
   source. A claim with no source **does not ship** — drop it or list it as an open question
   (invention is forbidden — playbook §1.5).
4. **Synthesise** into a Research-findings page: **summary**, **findings** (each cited), **open
   questions / gaps**, **sources**.
5. **Create the page** in the Specs DB (data-source id from `@.claude/sdd/data-sources.md`) with
   `Doc type = Research`, `Status = Draft`, `Version = 0.1`, `Last updated = today`. Link related
   features if any apply.
6. **End with one line:** `Research page created: <title>. Findings: <n> (all cited). Use it as a Linked spec for /sdd:specify.`

## Do not

- Do **not** state a claim you can't cite — that's the AI-slop failure mode this phase exists to
  prevent.
- Do **not** write code (denied by tool policy anyway).
- Do **not** fetch the data-source IDs from Notion — they're embedded above.
