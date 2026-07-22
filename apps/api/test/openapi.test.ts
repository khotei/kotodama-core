import { BunHttpServer } from '@effect/platform-bun'
import { describe, expect, it } from '@effect/vitest'
import { WordVerdict } from '@kotodama/core/words'
import { TestDatabaseLive } from '@kotodama/database/testing'
import { AiServiceTest } from '@kotodama/platform/ai/testing'
import { QueueLocalStackLive } from '@kotodama/platform/queue/testing'
import { Effect, Layer } from 'effect'
import { HttpClient, HttpRouter } from 'effect/unstable/http'
import { HttpApiBuilder, OpenApi } from 'effect/unstable/httpapi'
import { KotodamaApi } from '../src/kotodama.api'
import { WordsApiLive } from '../src/words/words.handler'

// The derivation is pure — `OpenApi.fromApi` reads the in-memory `KotodamaApi` singleton and returns
// a plain object, so structure is asserted without a server or a container.
describe('OpenApi.fromApi(KotodamaApi)', () => {
  const spec = OpenApi.fromApi(KotodamaApi)
  const paths = spec.paths

  it('emits an OpenAPI 3.1.0 document over all five words endpoints (AC-1)', () => {
    expect(spec.openapi).toBe('3.1.0')
    expect(paths['/api/words/{language}/{word}']?.get).toBeDefined() // getWord
    expect(paths['/api/words/{language}/{word}/state']?.get).toBeDefined() // getWordState
    expect(paths['/api/words/{language}/{word}/build']?.post).toBeDefined() // buildWord
    expect(paths['/api/words/{language}/search']?.get).toBeDefined() // search
    expect(paths['/api/words/{language}/counts']?.get).toBeDefined() // counts
  })

  it('renders each declared tagged error as its per-status response (AC-2)', () => {
    // getWord → WordNotReadyError 409.
    expect(paths['/api/words/{language}/{word}']?.get?.responses['409']).toBeDefined()
    // buildWord → the 409 (already-ready / in-progress) + 422 (invalid-input) family, per-status —
    // NOT collapsed into one 500 (which a `Schema.Union` error would yield).
    const build = paths['/api/words/{language}/{word}/build']?.post?.responses
    expect(build?.['200']).toBeDefined()
    expect(build?.['409']).toBeDefined()
    expect(build?.['422']).toBeDefined()
    expect(build?.['500']).toBeUndefined()
  })

  it('sets a project-meaningful info.title/version, not the generator defaults (AC-8)', () => {
    expect(spec.info.title).toBe('Kotodama API')
    expect(spec.info.title).not.toBe('Api')
    expect(spec.info.version).not.toBe('0.0.1')
  })
})

// The served endpoint needs a real router; the words handlers require DB/JobsQueue/AiService, so the
// server boots the same container-backed domain layer as `words-api.test.ts` (the openapi route
// itself touches none of it). The typed `HttpApiClient` can't reach a router-level route, so the
// test issues a raw `HttpClient` GET — the `layerTest` client prepends the ephemeral server URL.
const AiServiceAdmit = AiServiceTest({
  object: WordVerdict.make({ isValid: true, reason: 'admit' }),
})
const DomainLive = QueueLocalStackLive.pipe(
  Layer.provideMerge(TestDatabaseLive),
  Layer.provideMerge(AiServiceAdmit),
)
const ApiLive = HttpApiBuilder.layer(KotodamaApi, { openapiPath: '/api/openapi.json' }).pipe(
  Layer.provide(WordsApiLive),
)
const TestLayer = HttpRouter.serve(ApiLive, { disableListenLog: true, disableLogger: true }).pipe(
  Layer.provideMerge(BunHttpServer.layerTest),
  Layer.provideMerge(DomainLive),
)

it.layer(TestLayer, { timeout: '120 seconds' })((it) => {
  describe('GET /api/openapi.json', () => {
    it.effect('→ 200 application/json, an OpenAPI 3.1.0 doc, at any host (AC-3, AC-4)', () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient
        const res = yield* client.get('/api/openapi.json')

        expect(res.status).toBe(200)
        expect(res.headers['content-type']).toContain('application/json')

        const spec = (yield* res.json) as unknown as OpenApi.OpenAPISpec
        expect(spec.openapi).toBe('3.1.0')
        // Host-agnostic: the derived doc bakes in no `servers`/host, so a consumer targets it purely
        // by the base URL it fetched from (AC-4).
        expect(spec.servers).toBeUndefined()
      }),
    )
  })
})
