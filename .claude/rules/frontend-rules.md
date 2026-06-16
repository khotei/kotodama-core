---
paths:
  - "apps/web/**"
---

# Frontend rules (apps/web)

**Lockdown** (the canonical rule is `.claude/rules/dependency-hierarchy.md` — this only restates the
FE edge): `apps/web` imports **no** internal `@lexiai/*` package. There is no FE vocabulary/contract
package right now (`packages/schemas` was deprecated; the `HttpApi` contract lives server-side in
`apps/api/src/words/words.api.ts`) — re-establish the FE consumption surface when the first web
feature lands. Enforced by Biome `noRestrictedImports` alone — the per-package `tsconfig`
`references` were removed in F-PLAT-002.

- **React 19** with the **React Compiler** on (via `@vitejs/plugin-react` babel plugin). Do not hand-write `useMemo`/`useCallback` for things the compiler memoises — let it work. The bundle should contain `react-compiler-runtime`.
- **TanStack Router** (file-based routing) — plugin is deferred until the first route lands; `@tanstack/react-router` is already a dependency.
- **Tailwind v4** — entry is `@import "tailwindcss";` (not the v3 `@tailwind` directives). Prefer utility classes in JSX; avoid `@apply` in component CSS where possible.
- **State:** `@effect/atom-react` for app state that bridges to Effect.
- **HTTP client:** undecided — the `HttpApi` contract lives server-side (`apps/api/src/words/words.api.ts`); the FE consumption surface is re-decided when the first web feature lands. Do **not** add `axios` or hand-rolled `fetch` wrappers.
- **Env:** `VITE_API_BASE_URL` is exposed via `import.meta.env` (Vite auto-injects `VITE_`-prefixed vars).
- **Structure:** `src/app/`, `src/features/`, `src/lib/`, `src/components/`.

Commands: `bun run --filter '@lexiai/app-web' dev` (Vite dev + HMR) · `build` · `preview`.
