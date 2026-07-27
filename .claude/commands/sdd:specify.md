---
description: "Shape: gather evidence + draft a Shaped Feature (EARS) with a linked research Spike"
argument-hint: "<feature idea>"
context: fork
agent: spec-author
---

<!-- Compiled from the Kotodama Notion hub + the agent-loop guide github.com/khotei/terminal-stack/blob/main/docs/working-with-agents.md. Re-sync on change. -->

You are running the **Shape** phase of the Kotodama SDD loop — evidence-gathering and spec in one run.

**Input:** a one-line feature idea — `$ARGUMENTS`.
**Output:** two linked **Work** rows — a Feature (`Type = Feature`, `Status = Shaped`) + a research
**Spike** sub-item holding the cited findings. Notion-only (no local `spec.md`; see `@.claude/rules/sdd.md`).

**Embedded — do NOT fetch from Notion:** the feature template `@.claude/sdd/feature-template.md`, the
property contract `@.claude/sdd/property-contract.md`, the data-source IDs `@.claude/sdd/data-sources.md`.
**Fetch live:** the evidence — existing Knowledge docs, this repo's code, the open web/docs.

## Steps

1. **Gather (in context).** Scope the idea into the questions the spec must answer; pull cited
   evidence to answer them. Surface the best-in-class option, not the naive default the Plan would
   inherit. Hold the findings in context — no separate hand-off.
2. **Set the row's dials.** `Appetite` (Small / Batch), `Priority` (P0–P3), `Persona` (≥1 of
   Learner · Creator · Contributor — never empty). Auto-key `KO-<n>` (invent no ID).
3. **Fill every section** of the feature template — the **why** only (Goal · Why · Outcomes · Scope ·
   EARS ACs · Open questions · References). Cite, don't restate. No architecture/data-model/design —
   that's the Plan.
4. **ACs in EARS** — *WHEN <event> THE SYSTEM SHALL <behavior>*; observable, one-command-checkable. No Gherkin.
5. **Mark `[TBD]`** every unresolved decision with what blocks it — never invent an answer.
6. **Write the two rows.** Create the **Feature** (every field per the property contract,
   `Status = Shaped`, `Knowledge` relation → any doc you cited); then create the **research Spike**
   (`Type = Spike`, `Status = Done`, `Parent item` = the Feature), body = Summary · Findings (each
   cited) · gaps · sources. Knowledge is NOT written (human-promoted only).
7. **End with one line:** `Shaped KO-<n> (+ research Spike). Open TBDs: <count>. Next: /sdd:clarify KO-<n>.`

## Do not

- Do **not** plan or implement (Phase 3+). Designing tables/modules/APIs → stop.
- Do **not** write research to Knowledge — the Spike lives in Work; Knowledge is curated by hand.
- Do **not** fetch the template / contract / data-source IDs from Notion — embedded above.
