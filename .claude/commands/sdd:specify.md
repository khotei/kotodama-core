---
description: "Phase 1 (Specify): draft a Shaped feature row in Notion from a one-line idea"
argument-hint: "<feature idea>"
context: fork
agent: spec-author
---

<!-- Compiled from the Kotodama Notion hub + the agent-loop guide github.com/khotei/terminal-stack/blob/main/docs/working-with-agents.md. Re-sync on change. -->

You are running **Phase 1 (Specify)** of the Kotodama SDD loop.

**Input:** a one-line feature idea — `$ARGUMENTS`.
**Goal:** one fully-filled **Work row** (`Type = Feature`), `Status = Shaped`, in the Work DB.
Notion-only — no local `spec.md` (see `@.claude/rules/sdd.md`).

**Embedded — do NOT fetch from Notion** (in-repo, so the run works even if a hub page is
renamed/moved): the feature template `@.claude/sdd/feature-template.md`, the property contract
`@.claude/sdd/property-contract.md`, and the data-source IDs `@.claude/sdd/data-sources.md` (the
Work collection id lives there).
**Fetch live — volatile content:** the Knowledge docs to cite and the personas.

## Steps

1. **Set the row's dials.** A Feature is a Work row with `Type = Feature`; its auto-key is `KO-<n>`
   (do not invent an ID or an Area). Choose `Appetite` (Small / Batch), `Priority` (P0–P3), and
   `Persona` (one or more of Learner · Creator · Contributor — never empty).
2. **Read the sources to cite.** Search the Knowledge DB (scope to its data-source id from
   `@.claude/sdd/data-sources.md`) for the product "why" / research / personas that justify this
   feature; read the sections behind its choices. Open the relevant `kotodama-core/` code if it
   grounds a claim — the repo, not a Notion Tech spec, is the source of truth for *how*.
3. **Fill every section** of `@.claude/sdd/feature-template.md` — the **why** only (Goal · Why ·
   Outcomes · Scope · EARS ACs · Open questions · References). Do **not** restate a source; cite the
   repo path / Knowledge doc. No architecture, data-model, or design sections — those are the Plan.
4. **Write acceptance criteria in EARS** — *WHEN \<event\> THE SYSTEM SHALL \<behavior\>*. Each AC
   observable from outside the system; checkable by a fresh-context agent or one command. No Gherkin.
5. **Mark unresolved decisions `[TBD]`** with a one-line note on what blocks each — never invent an
   answer to close a gap.
6. **Create the Work row** (data-source id from `@.claude/sdd/data-sources.md`) with `Type = Feature`
   and **every field set** per `@.claude/sdd/property-contract.md`, `Status = Shaped`. Link the
   `Knowledge` relation to the research/why doc(s). `Persona` must not be empty. Put the template body
   in the page.
7. **End with one line:** `Spec drafted at KO-<n>. Open TBDs: <count>. Next: /sdd:clarify KO-<n>.`

## Do not

- Do **not** plan or implement. If you catch yourself designing tables, modules, or APIs, **stop** —
  that's Phase 3 (`/sdd:plan`). (Writing code is impossible for you by tool policy anyway.)
- Do **not** fetch the template / contract / data-source IDs from Notion — they're embedded above.
