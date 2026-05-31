# Frontend rules (apps/web)

**Lockdown:** Only `@lexiai/schemas` and `@lexiai/http` can be imported from internal packages — no exceptions. Enforced by Biome and tsconfig references.

- **React 19** with the **React Compiler** on (via `@vitejs/plugin-react` babel plugin). Do not hand-write `useMemo`/`useCallback` for things the compiler memoises — let it work. The bundle should contain `react-compiler-runtime`.
- **TanStack Router** (file-based routing) — plugin is deferred until the first route lands; `@tanstack/react-router` is already a dependency.
- **Tailwind v4** — entry is `@import "tailwindcss";` (not the v3 `@tailwind` directives). Prefer utility classes in JSX; avoid `@apply` in component CSS where possible.
- **State:** `@effect/atom-react` for app state that bridges to Effect.
- **HTTP client:** comes from `@lexiai/http` (Effect `HttpApi` client). Do **not** add `axios` or hand-rolled `fetch` wrappers.
- **Env:** `VITE_API_BASE_URL` is exposed via `import.meta.env` (Vite auto-injects `VITE_`-prefixed vars).
- **Structure:** `src/app/`, `src/features/`, `src/lib/`, `src/components/`.

Commands: `bun run --filter '@lexiai/app-web' dev` (Vite dev + HMR) · `build` · `preview`.
