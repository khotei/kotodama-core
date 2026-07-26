---
paths:
  - "readme.md"
---

# Human-facing docs (`readme.md`)

`claude-md.md`'s why-not-what discipline governs `readme.md` too (the single hand-written human doc).
This file only adds the guards a link-heavy README needs.

- **Commands come from `package.json` — the doc names the script and says *why*, never its substeps.** New run path ⇒ a new script, not a new paragraph. (Exception: the quick-start curls — direct API usage *is* the surface, not a script.)
- **README scope** (Diátaxis orientation + how-to): what it is · stack-at-a-glance (identity, not versions) · one quick-start · the environments matrix (*why* local/test/prod differ, invariants linked to their owning rule) · contributing pointers · link map. **Never** a file tree, command substeps, or restated rules — link the owning `.claude/rules/*` / per-layer `CLAUDE.md` / `*.ts`.
- **Link integrity is CI-enforced** — an offline lychee dead-link check over `readme.md` (`.github/workflows/ci.yml`). Fix stale links; don't disable it.

## Deliberately NOT done (don't re-litigate)

- **No `docs/` tier** — its facts already had owners; the one survivor (environments matrix) moved into the README. A genuinely new explanation goes to the Tech spec or a rule.
- No typedoc/generated site (unpublished, no public API), no markdown doctests (Bun/vitest has none — the quick-start commands are the proof), no docs-changed CI gate / last-reviewed stamps / CODEOWNERS.
