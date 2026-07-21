# Effect HttpApi (v4 beta) — project pattern notes

HttpApi is **in beta** and lives under `effect/unstable/*`. Import from there; read the
vendored source before writing endpoints.

- Source: `repos/effect-smol/packages/effect/src/unstable/httpapi/` —
  `HttpApi.ts`, `HttpApiGroup.ts`, `HttpApiEndpoint.ts`, `HttpApiBuilder.ts`,
  `HttpApiClient.ts`, `HttpApiSecurity.ts`, `HttpApiError.ts`, `HttpApiSchema.ts`,
  `HttpApiTest.ts`, `OpenApi.ts`.
- HTTP primitives: `repos/effect-smol/packages/effect/src/unstable/http/` (`HttpRouter.ts`,
  `HttpServer.ts`, `HttpClient.ts`, …).

The contract lives with its server — `apps/api/src/words/words.api.ts` beside
`words.handler.ts` (one folder per resource group).

## Shape

```ts
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi'
import { Schema } from 'effect'
import { WordEntity } from '@kotodama/core/database'

const getWord = HttpApiEndpoint.get('getWord', '/words/:id')
  .setSuccess(WordEntity)

const words = HttpApiGroup.make('words').add(getWord)

export const Api = HttpApi.make('kotodama').add(words)
```

- Endpoints: `HttpApiEndpoint.get` / `.post` (+ path/payload/success/error schemas).
- Groups: `HttpApiGroup.make(...).add(endpoint)`.
- Api: `HttpApi.make(...).add(group)`.
- Security: `HttpApiSecurity.http` / `.bearer` / `.apiKey` (`HttpApiSecurity.ts`).

## Server vs client

- Server: implement with `HttpApiBuilder.*` in `apps/api`, served via `@effect/platform-bun`.
- Client: derive a typed client with `HttpApiClient.*` (no `fetch`/`axios`) when a consumer needs one.

## Testing

`HttpApiTest.ts` (new in v4 beta) provides in-memory API testing — prefer it over spinning a
real server in unit tests.

## Avoid

- Guessing the import path — it's `effect/unstable/httpapi` during the beta, not a stable
  path. Confirm against the vendored `index.ts`.
- Hand-rolled HTTP clients — derive the typed client from the contract with `HttpApiClient.*`.
