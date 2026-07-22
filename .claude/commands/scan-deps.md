---
description: Verify no forbidden cross-layer or repos/ imports exist
---

Verify the dependency hierarchy (see `@.claude/rules/dependency-hierarchy.md`) is intact.

1. Run `bun run lint` — Biome's `style/noRestrictedImports` rules fail on any forbidden cross-layer import (e.g. `platform/**` importing `@kotodama/core/*`, or `core/database/**` importing `@kotodama/core/repositories`).
2. Confirm no application code imports from `repos/**`:
   `grep -rn "repos/" apps core platform infra --include='*.ts' --include='*.tsx' || echo "none"`
3. If `scripts/check-deps.ts` exists (transitive-import fallback), run it too.

Report any violation with file:line and which rule it breaks. If clean, confirm the layer graph holds.
