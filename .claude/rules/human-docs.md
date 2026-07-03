---
paths:
  - "readme.md"
  - "docs/**"
---

# Human-facing docs (`readme.md` + `docs/**`)

**Path-scoped rule.** The same discipline `.claude/rules/claude-md.md` holds over the AI-facing
surface (`CLAUDE.md` + rules) applies to the **developer-facing** surface — `readme.md` and `docs/**`.
This file does not restate `claude-md.md`; it **extends** it to human docs and adds the two guards a
link-heavy human doc needs. Read `claude-md.md` first — its test ("could I derive this from the
source? then don't write it") is the parent rule.

The whole point: **a developer doc must survive code change without a manual edit.** Drift is
duplication — a doc that restates a fact the code already owns is a second copy you must sync by hand.
Remove the copies and the docs stop rotting.

## The six clauses

1. **Why, not what.** Hand-write only *intent* and *the path to run things* — never facts the code is
   the source of truth for (signatures, structure, versions, command steps). Same bar as `claude-md.md`.
2. **Commands come from `package.json`, docs name the script.** Write `bun run --filter '@kotodama/infra'
   local:up` and explain *why* — never the substeps it runs. The script is the single source; a doc
   that re-lists its steps drifts the day the script changes. New run path ⇒ a new script
   (`local:smoke`), not a new doc paragraph.
3. **Link, don't restate.** Cross-reference the one authoritative home (a `.claude/rules/*` file, a
   per-layer `CLAUDE.md`, the Tech spec, a `*.ts` source) instead of copying it. A fact lives in
   exactly one place; everything else points at it.
4. **The sharp signal.** If a rename or refactor *forces* a doc edit, the doc was holding **what**, not
   **why** — move that knowledge back to being implied by the code (or to a link) and delete the line.
   A doc you must "keep in sync" is mis-written.
5. **Diátaxis drift ranking** ([diataxis.fr](https://diataxis.fr/)). The four modes drift at different
   rates: **reference** (mirrors the machinery) drifts *fastest*; **explanation** (the *why*) drifts
   *slowest*; how-to/tutorial sit between. So **hand-write only explanation + how-to; link or generate
   everything reference-shaped.** Each human doc declares its mode (table below) and stays in it.
6. **Link integrity is enforced, not trusted.** A link-don't-restate strategy's one residual drift
   vector is a **broken link** (a renamed target). CI runs a dead-link check (lychee, in
   `.github/workflows/ci.yml`) over `readme.md` + `docs/**` — so a stale link is a loud build failure,
   not silent rot. Don't disable it; fix the link.

## Diátaxis mode per doc (what each may contain)

| Doc | Mode | May contain | Must NOT contain |
|---|---|---|---|
| `readme.md` | Orientation + how-to map | what it is · stack-at-a-glance (identity, not versions) · one quick-start · link map | a file tree · command substeps · restated rules |
| `docs/running.md` | How-to | how to run in local / test / prod, keyed on **why they differ** (config provenance) | hand-listed command steps (name the script) |
| `docs/architecture.md` | Explanation (link-hub) | a 1-screen orientation + the *why* of the topology | any restatement of the dependency rules — link `dependency-hierarchy.md` |
| `docs/contributing.md` | How-to | how to work the repo, each step **linking** its `.claude/rules/*` source | restated commit/PR/tooling rules |
| *reference* | — | **none is hand-written** | reference is the code + types + per-layer `CLAUDE.md` — link it, never mirror it |

## What is deliberately NOT done (recorded so it isn't re-litigated)

- **No typedoc / generated docs-site** — the repo is unpublished with no public API surface to mirror
  (YAGNI; `.claude/rules/effect-conventions.md` "demonstrated need").
- **No markdown doctests** — Bun/vitest has no doctest support; `local:smoke` is the runnable proof.
- **No semantic doc-linter** — a thin link-hub must legitimately name `use-cases`/`core`/the flow, so a
  keyword grep can't separate an orientation map from a forbidden paraphrase. This rule + review is the
  guard.
- **No "docs-changed" CI gate, last-reviewed stamps, or CODEOWNERS** — net-negative ceremony for a repo
  this size.
