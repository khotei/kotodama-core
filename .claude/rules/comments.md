# Code comments

**Always-loaded rule.** The default is **no comment** — code is the source of truth, and an agent
acts on a stale comment with full confidence, so a bad comment is worse than none. Comment the
**WHY**; let the code state the WHAT.

## Gate A — should it exist?

Ask: **"Could a competent reader of this stack get this from the code itself?"** (types,
signatures, control flow, a test name, a rule/`CLAUDE.md`). If yes → delete it — on sight, when
reviewing existing code. Only four reasons to keep a comment:

- **A non-obvious DECISION + the rejected alternative** — "barrel entry, not the dir glob —
  globbing double-counts re-exported tables." Stops an agent "fixing" it back.
- **A GOTCHA or non-local coupling** surprising from a distance — e.g. `snakeCase.table` ⇒ do NOT
  also set `transformQueryNames`.
- **An INVARIANT the type can't express** — "`pending` rows legitimately have null content."
- **A usage CONSTRAINT on an exported symbol** — "provide `ConfigProviderLive` first."

Never write: line narration or step markers (`// map rows`, `// then validate`), a doc block that
re-says the function name, a `@param` restating a type, or provenance tags (`(T0N)`, feature §refs —
traceability lives in the commit `Refs:` footer, not on lines; keep a §-ref only when the reader
must open it to act).

> **Pre-write test:** write the comment, delete it, re-read the code. If the code still tells you
> the same thing, keep it deleted.

## Gate B — write the survivor as documentation

**An export does NOT get a doc block by default** — most exported symbols need none; only a
comment that passed Gate A gets written up. A surviving comment defaults to a **TSDoc `/** … */`
block on the symbol** — the *interface
comment*: one declarative sentence a caller can use the symbol from **without reading its body**
(if you can't write that sentence, fix the interface first), plus an optional second paragraph only
for the gotcha/invariant/alternative that got it past Gate A. A single-line `//` is for a pinpoint
gotcha *inside* a body, at the exact line it warns about.

Tags: `{@link Symbol}` for internal cross-refs; `@see` for a rule/spec pointer; `@example` (fenced
```ts) only for genuinely non-obvious usage; `@param`/`@returns` only when name + type don't
already say it. Never `@since`/`@category`/docgen tags — Kotodama isn't a published library. The
Gate-A bar is unchanged in this form: one strong sentence beats a paragraph.

## Maintenance — a comment is never "kept in sync"

If a code change makes a comment wrong, the comment was restating the code — **delete it, don't
update it** (the same sharp signal as `claude-md.md`). Never write or touch comments on
exploratory edits. Never narrate architecture/ownership/layering in a comment — that lives in the
rules/`CLAUDE.md`; at most point there. Calibration: most files need **zero** comments; the most
heavily-commented file in this repo earns ~15 lines of measured gotchas, not 50 of narration.

## Not comments — never strip these

`biome-ignore`, `@ts-expect-error`, `@ts-ignore`, `eslint-disable`, shebangs, and build pragmas are
code, not prose. They stay regardless of the rules above.
