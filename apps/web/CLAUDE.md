# apps/web — `@lexiai/app-web`

React 19 SPA (Vite + Tailwind v4 + React Compiler).

**No internal `@lexiai/*` package may be imported — no exceptions.** There is no FE vocabulary
package (`packages/schemas` was deprecated); never import `core/`, `database/`, `repositories/`, or
backend-only packages (`ai`, `queue`, `storage`). The FE's contract surface is re-established when
the UI returns. Enforced by Biome (`noRestrictedImports`).

- The HTTP-client surface is undecided (the `HttpApi` contract lives server-side in
  `apps/api/src/words/words.api.ts`; how the FE consumes it is re-decided when the first web
  feature lands). No `axios`/hand-rolled `fetch` wrappers in the meantime.
- See `@.claude/rules/frontend-rules.md` and `.claude/agent-patterns/effect-schema.md`.
