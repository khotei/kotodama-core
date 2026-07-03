---
description: "Phase 1 (Specify): draft a Drafted feature row in Notion from a one-line idea"
argument-hint: "<feature idea>"
context: fork
agent: spec-author
---

<!-- Generated from SDD playbook §7.2 (+ §6.1 template, §4 contract) — https://www.notion.so/36dfb28bd5f181238a86d26457bc24e7. Re-sync on change. -->

You are running **Phase 1 (Specify)** of the Kotodama SDD playbook.

**Input:** a one-line feature idea — `$ARGUMENTS`.
**Goal:** one fully-filled **Feature page** in the Features DB, `Status = Drafted`. Notion-only —
no local `spec.md` (see `@.claude/rules/sdd.md`).

**Embedded — do NOT fetch from Notion** (in-repo, so the run works even if the playbook page is
renamed/moved): the feature template `@.claude/sdd/feature-template.md`, the property contract
`@.claude/sdd/property-contract.md`, and the data-source IDs `@.claude/sdd/data-sources.md` (the
Features collection id lives there).
**Fetch live — volatile content:** the specs to cite, the personas, and the current max Feature ID.

## Steps

1. **Pick the `Area`** for the idea (exactly one of the §4 enum: Input · Content · Memory · Growth ·
   Monetization · Platform · Personalization · Trust). Then find the **current max `Feature ID`** in
   that area: search the Features DB (scope to its data-source id from
   `@.claude/sdd/data-sources.md`) and assign `F-<AREA>-<max+1>`, the number zero-padded to three
   digits.
2. **Read the sources to cite.** Search the Specs DB for the Product / Tech / Design / Research
   specs and the Personas doc; read the sections that justify this feature's choices. Open the
   relevant `kotodama-core/` code if it grounds a claim.
3. **Fill every section** of `@.claude/sdd/feature-template.md`. Crystallise what implementation
   must produce — do **not** restate the spec; cite it by section (`Tech spec §2.6`).
4. **Write acceptance criteria in EARS** — *WHEN \<event\> THE SYSTEM SHALL \<behavior\>*. Each AC
   observable from outside the system; checkable by a fresh-context agent or one command. No Gherkin.
5. **Mark unresolved decisions `[TBD]`** with a one-line note on what blocks each — never invent an
   answer to close a gap.
6. **Create the Feature row** in the Features DB (data-source id from
   `@.claude/sdd/data-sources.md`) with **every field set** per `@.claude/sdd/property-contract.md`,
   and `Status = Drafted`. `Persona` must not be empty. Put the template body (§1–§15) in the page.
7. **End with one line:** `Spec drafted at F-<AREA>-<NNN>. Open TBDs: <count>. Next: /sdd:clarify F-<AREA>-<NNN>.`

## Do not

- Do **not** plan or implement. If you catch yourself designing tables, modules, or APIs, **stop** —
  that's Phase 3 (`/sdd:plan`). (Writing code is impossible for you by tool policy anyway.)
- Do **not** fetch the template / contract / data-source IDs from Notion — they're embedded above.
