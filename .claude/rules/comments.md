# Code comments

**Always-loaded rule.** Default is **no comment** — a stale comment is acted on with full confidence,
so a bad one is worse than none. Comment the **WHY**; code states the WHAT.

## Gate A — should it exist?

**"Could a competent reader of this stack get this from the code itself?"** (types, signatures,
control flow, a test name, a rule/`CLAUDE.md`.) Yes → delete it on sight. Only four reasons to keep:

- a non-obvious **DECISION + the rejected alternative** (stops an agent "fixing" it back);
- a **GOTCHA / non-local coupling** surprising from a distance;
- an **INVARIANT the type can't express** ("`pending` rows legitimately have null content");
- a usage **CONSTRAINT on an exported symbol** ("provide `ConfigProviderLive` first").

Never write: line narration / step markers, a doc block re-saying the function name, a `@param`
restating a type, or provenance tags (`(T0N)`, feature §refs — traceability lives in the commit
`Refs:` footer). **Test:** write it, delete it, re-read the code — if the code still says the same
thing, keep it deleted.

## Gate B — write the survivor as documentation

An export does **not** get a doc block by default. A survivor defaults to a **TSDoc `/** … */`**
interface comment: one declarative sentence a caller can use the symbol from without reading its body
(if you can't write that sentence, fix the interface), plus an optional second paragraph only for the
gotcha/invariant/alternative that got it past Gate A. A single-line `//` is a pinpoint gotcha *inside*
a body. Tags: `{@link}`, `@see`, `@example` (only if genuinely non-obvious), `@param`/`@returns` only
when name+type don't say it. **Never** `@since`/`@category`/docgen tags — Kotodama isn't a published
library.

## Maintenance

A comment is never "kept in sync" — if a change makes it wrong, it was restating code: **delete, don't
update**. Never narrate architecture/ownership/layering in a comment (that's the rules/`CLAUDE.md`).
Most files need **zero** comments; the most-commented file earns ~15 lines of measured gotchas.

**Never strip these — they are code, not prose:** `biome-ignore`, `@ts-expect-error`, `@ts-ignore`,
`eslint-disable`, shebangs, build pragmas. They stay regardless of the rules above.
