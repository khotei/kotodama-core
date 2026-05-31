# Effect HttpApi (v4 beta) — project pattern notes

HttpApi is **in beta** and lives under `effect/unstable/*`. Import from there; read the
vendored source before writing endpoints.

- Source: `repos/effect-smol/packages/effect/src/unstable/httpapi/` —
  `HttpApi.ts`, `HttpApiGroup.ts`, `HttpApiEndpoint.ts`, `HttpApiBuilder.ts`,
  `HttpApiClient.ts`, `HttpApiSecurity.ts`, `HttpApiError.ts`, `HttpApiSchema.ts`,
  `HttpApiTest.ts`, `OpenApi.ts`.
- HTTP primitives: `repos/effect-smol/packages/effect/src/unstable/http/` (`HttpRouter.ts`,
  `HttpServer.ts`, `HttpClient.ts`, …).

This contract lives in `@lexiai/http` and is consumed by both `apps/api` (server) and
`apps/web` (client) — keep it isomorphic.

## Shape

```ts
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi'
import { Schema } from 'effect'
import { Word } from '@lexiai/schemas'

const getWord = HttpApiEndpoint.get('getWord', '/words/:id')
  .setSuccess(Word)

const words = HttpApiGroup.make('words').add(getWord)

export const Api = HttpApi.make('lexiai').add(words)
```

- Endpoints: `HttpApiEndpoint.get` / `.post` (+ path/payload/success/error schemas).
- Groups: `HttpApiGroup.make(...).add(endpoint)`.
- Api: `HttpApi.make(...).add(group)`.
- Security: `HttpApiSecurity.http` / `.bearer` / `.apiKey` (`HttpApiSecurity.ts`).

## Server vs client

- Server: implement with `HttpApiBuilder.*` in `apps/api`, served via `@effect/platform-bun`.
- Client: derive a typed client with `HttpApiClient.*` — this is what `apps/web` uses (no
  `fetch`/`axios`).

## Testing

`HttpApiTest.ts` (new in v4 beta) provides in-memory API testing — prefer it over spinning a
real server in unit tests.

## Avoid

- Guessing the import path — it's `effect/unstable/httpapi` during the beta, not a stable
  path. Confirm against the vendored `index.ts`.
- Hand-rolled HTTP clients in `apps/web`.
