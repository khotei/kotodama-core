import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer, Option } from 'effect'
import { FetchHttpClient } from 'effect/unstable/http'
import { WikiClient, WikiClientLive, WikiError } from '../src/wiki.service'

/**
 * Canned routes for the fake fetch — keyed by URL substring so a test names the scenario it wants.
 * `undefined` body models a transport error (the fetch promise rejects).
 */
interface Route {
  readonly status: number
  readonly body?: unknown
  readonly reject?: boolean
}

/**
 * A {@link WikiClient} over `FetchHttpClient.layer` whose `Fetch` is replaced by a canned, no-network
 * stub — the idiomatic v4 way to fake the transport (see effect-smol `McpServer.test.ts`). The real
 * client path (request build → status read → schema decode) is exercised; only `globalThis.fetch` is
 * swapped.
 */
const testLayer = (routes: ReadonlyArray<readonly [string, Route]>): Layer.Layer<WikiClient> => {
  const fetch = (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    const match = routes.find(([key]) => url.includes(key))
    if (match === undefined) return Promise.reject(new Error(`no route for ${url}`))
    const route = match[1]
    if (route.reject) return Promise.reject(new Error('transport boom'))
    return Promise.resolve(
      new Response(route.body === undefined ? null : JSON.stringify(route.body), {
        status: route.status,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }
  return WikiClientLive.pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch as typeof globalThis.fetch)),
  )
}

const standardSummary = {
  type: 'standard',
  title: 'Lacuna',
  extract: 'A lacuna is a gap or missing part.',
  description: 'gap or missing part',
}

describe('WikiClient.summary', () => {
  it.effect('returns Option.some with decoded fields for a standard page (AC-5)', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiClient
      const result = yield* wiki.summary('en', 'lacuna')
      assert.isTrue(Option.isSome(result))
      const summary = Option.getOrThrow(result)
      assert.strictEqual(summary.type, 'standard')
      assert.strictEqual(summary.title, 'Lacuna')
      assert.strictEqual(summary.extract, 'A lacuna is a gap or missing part.')
    }).pipe(
      Effect.provide(testLayer([['/page/summary/', { status: 200, body: standardSummary }]])),
    ),
  )

  it.effect('maps HTTP 404 to Option.none, not an error (AC-5)', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiClient
      const result = yield* wiki.summary('en', 'nope')
      assert.isTrue(Option.isNone(result))
    }).pipe(
      Effect.provide(
        testLayer([
          [
            '/page/summary/',
            {
              status: 404,
              body: { type: 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found' },
            },
          ],
        ]),
      ),
    ),
  )

  it.effect('maps a disambiguation page to Option.none, not an error (AC-5)', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiClient
      const result = yield* wiki.summary('en', 'mercury')
      assert.isTrue(Option.isNone(result))
    }).pipe(
      Effect.provide(
        testLayer([
          ['/page/summary/', { status: 200, body: { type: 'disambiguation', title: 'Mercury' } }],
        ]),
      ),
    ),
  )

  it.effect('fails with WikiError on a malformed body', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiClient
      const error = yield* Effect.flip(wiki.summary('en', 'lacuna'))
      assert.instanceOf(error, WikiError)
      assert.strictEqual(error.method, 'summary')
    }).pipe(
      // `title` is required but missing → decode fails.
      Effect.provide(testLayer([['/page/summary/', { status: 200, body: { type: 'standard' } }]])),
    ),
  )

  it.effect('fails with WikiError on a transport error', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiClient
      const error = yield* Effect.flip(wiki.summary('en', 'lacuna'))
      assert.instanceOf(error, WikiError)
      assert.strictEqual(error.method, 'summary')
    }).pipe(Effect.provide(testLayer([['/page/summary/', { status: 200, reject: true }]]))),
  )
})

describe('WikiClient.searchTitle', () => {
  it.effect('returns the hit array from the search envelope', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiClient
      const hits = yield* wiki.searchTitle('en', 'lacuna', 5)
      assert.strictEqual(hits.length, 2)
      assert.strictEqual(hits[0]?.title, 'Lacuna')
      assert.strictEqual(hits[1]?.key, 'Lagoon')
    }).pipe(
      Effect.provide(
        testLayer([
          [
            '/search/title',
            {
              status: 200,
              body: {
                pages: [
                  { id: 1, key: 'Lacuna', title: 'Lacuna', description: 'gap', excerpt: null },
                  { id: 2, key: 'Lagoon', title: 'Lagoon', description: null },
                ],
              },
            },
          ],
        ]),
      ),
    ),
  )

  it.effect('returns [] for no hits', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiClient
      const hits = yield* wiki.searchTitle('en', 'zzzznothing', 5)
      assert.strictEqual(hits.length, 0)
    }).pipe(Effect.provide(testLayer([['/search/title', { status: 200, body: { pages: [] } }]]))),
  )
})
