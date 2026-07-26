# Effect HttpApi (v4 beta) — project pattern notes

HttpApi is **in beta** and lives under `effect/unstable/*`. Read the vendored source before writing
endpoints; server/client/testing usage mirrors `LLMS.md` §Building HttpApi servers.

- Source: `repos/effect-smol/packages/effect/src/unstable/httpapi/` —
  `HttpApi.ts`, `HttpApiGroup.ts`, `HttpApiEndpoint.ts`, `HttpApiBuilder.ts`,
  `HttpApiClient.ts`, `HttpApiSecurity.ts`, `HttpApiError.ts`, `HttpApiSchema.ts`,
  `HttpApiTest.ts`, `OpenApi.ts`.
- HTTP primitives: `repos/effect-smol/packages/effect/src/unstable/http/` (`HttpRouter.ts`,
  `HttpServer.ts`, `HttpClient.ts`, …).

The contract lives with its server — `apps/api/src/words/words.api.ts` beside
`words.handler.ts` (one folder per resource group).

## Avoid

- **Guessing the import path** — it's `effect/unstable/httpapi` during the beta, not a stable
  path. Confirm against the vendored `index.ts`. (This is the one thing the v3 prior gets wrong.)
- Hand-rolled HTTP clients — derive the typed client from the contract with `HttpApiClient.*`.
