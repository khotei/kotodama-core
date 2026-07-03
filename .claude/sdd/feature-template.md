<!-- Generated from SDD playbook §6.1 — https://www.notion.so/36dfb28bd5f181238a86d26457bc24e7. Re-sync on change. -->

# Feature page template (§6.1)

The body `/sdd:specify` fills when it creates a Features-DB row. §§5–11 are *implementation
surfaces* — include one section per concrete artifact the feature produces (workspace layout,
data model, API surface, UI screens, agent context, infra). Add, remove, or rename §§6–11 to fit
the feature; keep the §1–§5 + §12–§15 spine intact. For product (non-platform) features, also add
an extensive **User stories** section (*As a \<persona\>, I want \<action\>, so that \<benefit\>* —
one per distinct user goal) and make the §12 ACs trace back to those stories.

```markdown
> **Feature ID:** F-XXX-NNN · **Area:** <Area> · **Target release:** <Release> · **Priority:** P0 | P1 | P2 | P3
> **Reflects:** <mention source spec> §<section> *<section title>*, §<section> *<section title>*.
> This page is a **feature-level reflection** of the source spec — it does **not** restate the spec, it crystallises what implementation must produce and how it splits into tasks.
---
## 1. Goal
One paragraph, plain language. The end state in operational terms: what can a developer (or Claude Code) *do* on completion that they couldn't before. Phrase as "Stand up / wire / deliver X so that Y is possible — with Z preventing regression."

## 2. Why this exists
One paragraph. Strategic / product / architectural rationale. Why this feature has to land now, before what, instead of what. What compounds across later features if this is done wrong.

## 3. Outcomes (definition of done)
- High-level outcomes — *what's true when this is done*, not per-task checks.
- Each bullet observable from outside the implementation.
- Aim for 5–8 outcomes; if you have 15, the feature is two features.

## 4. Scope
### In scope
- ...
### Out of scope
- ...

## 5. Architecture reflection
The source spec defines the topology. This feature does not change it — it materialises the *code-layout / data-flow / system-interaction* view of it. Embed the relevant diagram or layout block. Call out the single most important invariant the implementation must protect.

## 6. <Implementation surface — e.g. "Workspace layout (what to scaffold)" | "Data model" | "API surface" | "UI screens">
Concrete listing of what this section produces. Be exhaustive within the section's scope. Cite source-spec sections for any non-trivial choice.

## 7. <Implementation surface — e.g. "Naming & dependency rules" | "Permissions model" | "Routing">
...

## 8. <Implementation surface — e.g. "Tech stack & version pinning" | "Integrations" | "Persistence">
...

## 9. <Implementation surface — e.g. "Tooling" | "Build & deploy">
...

## 10. <Implementation surface — e.g. ".claude/ files" | "Agent context" | "Observability">
...

## 11. <Implementation surface — e.g. "Environment & local infra" | "Configuration" | "Migration">
...
> Add or remove §§6–11 to fit the feature. Each section describes one tangible thing implementation must produce.

## 12. Acceptance criteria
- [ ] AC-1 — <observable from outside the implementation; verifiable by a fresh-context agent or a single command>.
- [ ] AC-2 — ...
- [ ] AC-N — ...

## 13. Proposed task breakdown (seeds for the Tasks DB)
Each bullet becomes one Claude Code task. Vertical slices where possible so they can run in parallel.
1. **<Imperative task title>.** One-line description of what it produces.
2. **<Imperative task title>.** ...

Ordering: <which tasks are strictly sequential, which can fan out, which run last (verification)>.

## 14. Open questions / risks
- **<Question or risk title>.** One-line description + mitigation or the next step to resolve it.
- ...

## 15. References
- **Source spec:** <mention-page>, §<sections cited>.
- **External docs / reference repos:** <links>.
- **Related features / specs:** <mention-pages>.

## Change log
| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | YYYY-MM-DD | <author> | Initial draft |
```

## Acceptance-criteria notation (Kotodama)

Write the §12 ACs in **EARS** form — *WHEN \<event\> THE SYSTEM SHALL \<behavior\>* (also WHILE /
WHERE / IF–THEN). EARS only — do **not** mix in Gherkin's *Given/When/Then* (a different system).
Each AC must be observable from outside the implementation and checkable by a fresh-context agent
or a single command. See `@.claude/rules/sdd.md`.
