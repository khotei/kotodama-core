---
paths:
  - "readme.md"
---

# Human-facing docs (`readme.md`)

**Path-scoped rule.** The same discipline `.claude/rules/claude-md.md` holds over the AI-facing
surface (`CLAUDE.md` + rules) applies to the **developer-facing** surface — `readme.md`, the single
hand-written human doc. This file does not restate `claude-md.md`; it **extends** it and adds the
guards a link-heavy human doc needs. Read `claude-md.md` first — its test ("could I derive this
from the source? then don't write it") is the parent rule.

The whole point: **a developer doc must survive code change without a manual edit.** Drift is
duplication — a doc that restates a fact the code already owns is a second copy you must sync by
hand. Remove the copies and the docs stop rotting.

## The clauses

1. **Why, not what.** Hand-write only *intent* and *the path to run things* — never facts the code
   is the source of truth for (signatures, structure, versions, command steps).
2. **Commands come from `package.json`, docs name the script.** Write `bun run --filter
   '@kotodama/infra' local:up` and explain *why* — never the substeps it runs. New run path ⇒ a new
   script, not a new doc paragraph. (Direct API usage — the quick-start curls — is the exception:
   that *is* the surface, not a script's substeps.)
3. **Link, don't restate.** Cross-reference the one authoritative home (a `.claude/rules/*` file, a
   per-layer `CLAUDE.md`, the Tech spec, a `*.ts` source) instead of copying it. The rules are
   plain markdown — perfectly readable by a human following a README link.
4. **The sharp signal.** If a rename or refactor *forces* a doc edit, the doc was holding **what**,
   not **why** — move that knowledge back to being implied by the code (or to a link) and delete
   the line.
5. **Scope of the README** (Diátaxis: orientation + how-to): what it is · stack-at-a-glance
   (identity, not versions) · one quick-start · the environments matrix (*why* the three
   environments differ, invariants linked to their owning rules) · contributing pointers · link
   map. Never: a file tree, command substeps, restated rules. Reference is the code + types +
   per-layer `CLAUDE.md` — link it, never mirror it.
6. **Link integrity is enforced, not trusted.** CI runs an offline lychee dead-link check over
   `readme.md` (`.github/workflows/ci.yml`) — a stale link is a loud build failure, not silent rot.
   Don't disable it; fix the link.

## What is deliberately NOT done (recorded so it isn't re-litigated)

- **No `docs/` tier.** The former `docs/{architecture,running,contributing}.md` were link-hubs
  whose every fact already had an owner (`readme.md`, `.claude/rules/*`, per-layer `CLAUDE.md`);
  the one human-facing synthesis worth keeping — the local/test/prod environments matrix — moved
  into the README. Don't recreate the folder to hold restatements; a genuinely new explanation
  goes to the Tech spec (Notion) or a rule.
- **No typedoc / generated docs-site** — the repo is unpublished with no public API surface to
  mirror (YAGNI; `.claude/rules/effect-conventions.md` "demonstrated need").
- **No markdown doctests** — Bun/vitest has no doctest support; the quick-start commands are the
  runnable proof.
- **No "docs-changed" CI gate, last-reviewed stamps, or CODEOWNERS** — net-negative ceremony for a
  repo this size.
