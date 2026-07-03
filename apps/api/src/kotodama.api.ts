import { HttpApi, OpenApi } from 'effect/unstable/httpapi'
import { wordsGroup } from './words/words.api'

// The single root HttpApi and sole contract author for the whole api. Every resource contributes one
// `HttpApiGroup`; adding a resource is one `.add(...)` here and nothing else — the OpenAPI document
// (served from `main.ts` via `openapiPath`) is derived from this value, so it reflects every group
// automatically. `Title`/`Version` set `info` so it isn't the generator defaults (`"Api"` / `"0.0.1"`).
export const KotodamaApi = HttpApi.make('kotodama')
  .add(wordsGroup)
  .prefix('/api')
  .annotateMerge(OpenApi.annotations({ title: 'Kotodama API', version: '0.0.0' }))
