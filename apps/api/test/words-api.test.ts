import { BunHttpServer } from '@effect/platform-bun'
import { describe, expect, it } from '@effect/vitest'
import { AiServiceTest } from '@lexiai/ai/testing'
import { WordVerdict } from '@lexiai/core-words'
import { enumAsyncJobStatus, enumLanguage, enumWordJobStage } from '@lexiai/database'
import { resetDb, TestDatabaseLive } from '@lexiai/database/testing'
import { QueueLocalStackLive } from '@lexiai/queue/testing'
import { seedRunningStage } from '@lexiai/repositories-async-word-jobs/testing'
import { seedReadyWord, seedUnreadyWord } from '@lexiai/repositories-words/testing'
import { Effect, Layer } from 'effect'
import { HttpRouter } from 'effect/unstable/http'
import { HttpApiBuilder } from 'effect/unstable/httpapi'
import { WordsApi } from '../src/words/words.api'
import { WordsApiLive } from '../src/words/words.handler'
import {
  assertStatus,
  buildWord,
  counts,
  getWord,
  getWordState,
  search,
} from './words-api-test-utils'

// `requestWordBuild` + the reads (selectWord / selectWordJobStages + collapseWordState) are plain
// functions over the repos (which `yield*` DB) + JobsQueue — a LocalStack SQS queue + an ephemeral
// Postgres — plus the verifier's `AiService` (the judge behind `requestWordBuild`, faked with a
// standing `isValid: true` verdict so `buildWord` admits without a network call; `main.ts` provides
// the real `AiServiceProd` here in prod). The handler flows bottom out at these boundaries, which this
// layer provides, so a test can seed the ground-truth state each read sees.
const AiServiceAdmit = AiServiceTest({
  object: WordVerdict.make({ isValid: true, reason: 'admit' }),
})
const DomainLive = QueueLocalStackLive.pipe(
  Layer.provideMerge(TestDatabaseLive),
  Layer.provideMerge(AiServiceAdmit),
)

const ApiLive = HttpApiBuilder.layer(WordsApi).pipe(Layer.provide(WordsApiLive))

// Real in-memory test server (ephemeral port) + the HttpClient bound to it; the typed client
// round-trips request/response through the contract schemas, guarding the FE↔BE isomorphism.
const TestLayer = HttpRouter.serve(ApiLive, { disableListenLog: true, disableLogger: true }).pipe(
  Layer.provideMerge(BunHttpServer.layerTest),
  Layer.provideMerge(DomainLive),
)

const EN = enumLanguage.en

it.layer(TestLayer, { timeout: '120 seconds' })((it) => {
  describe('GET /api/words/:language/:word', () => {
    it.effect('→ null for an unknown word', () =>
      Effect.gen(function* () {
        yield* resetDb
        expect(yield* getWord(EN, 'ghost')).toBeNull()
      }),
    )

    it.effect('→ the Word once the word is Ready', () =>
      Effect.gen(function* () {
        yield* resetDb
        const saved = yield* seedReadyWord(EN, 'lacuna')

        const word = yield* getWord(EN, 'lacuna')
        expect(word?.word).toBe('lacuna')
        expect(word?.coreDefinition).toBe(saved.coreDefinition)
      }),
    )

    // A word that exists but is still building is a 409 (the ready-gate), NOT a 404 and NOT a 200 null:
    // 404 would read as non-existence while the word exists and is building (Clarify TBD-1 → 409).
    it.effect('→ a typed WordNotReadyError (409) for a building word, not null (AC-12)', () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* seedUnreadyWord(EN, 'lacuna', 'running')

        const error = yield* getWord(EN, 'lacuna').pipe(Effect.flip)
        expect(error._tag).toBe('WordNotReadyError')
      }),
    )
  })

  describe('GET /api/words/:language/:word/state', () => {
    it.effect('→ the running WordStateView round-trips over the wire', () =>
      Effect.gen(function* () {
        yield* resetDb
        // The `words` row is the state's discriminant (seeded atomically with its stages); a stage
        // row alone is an impossible production state, so seed the running row too.
        yield* seedUnreadyWord(EN, 'lacuna', 'running')
        yield* seedRunningStage(EN, 'lacuna', enumWordJobStage.fetch_source)

        const state = yield* getWordState(EN, 'lacuna')
        // The API owns only that the union discriminant + stage shape survive the contract encoding;
        // stage *ordering* and the four-state collapse are owned by core's pure collapseWordState
        // (word-state-collapse.test.ts), so assert membership, not position.
        assertStatus(state, 'running')
        expect(state.stages).toContainEqual({
          stage: enumWordJobStage.fetch_source,
          status: enumAsyncJobStatus.running,
        })
      }),
    )

    it.effect('→ null for an unknown word', () =>
      Effect.gen(function* () {
        yield* resetDb
        expect(yield* getWordState(EN, 'ghost')).toBeNull()
      }),
    )
  })

  describe('POST /api/words/:language/:word/build', () => {
    it.effect('on a Not-yet-made word → the seeded pending state (AC-3)', () =>
      Effect.gen(function* () {
        yield* resetDb
        const state = yield* buildWord(EN, 'lacuna')
        // The seed lands `pending`; the response is that state verbatim (the worker flips it later).
        expect(state.status).toBe('pending')
      }),
    )

    // One representative typed-error round-trip is enough to prove the rejection encodes as a typed
    // 4xx (not a 500): every build error is a TaggedError through the same HttpApi error machinery, and
    // each is *compile-checked* against the endpoint's declared union (words.api.ts) — a missing
    // declaration fails tsc, never silently 500s. The per-state branching (in-progress vs already-ready
    // vs invalid input) is owned by word-build-request.use-case.test.ts, so it is not re-enumerated here.
    it.effect('on a Being-made word → a typed WordBuildInProgressError (AC-7)', () =>
      Effect.gen(function* () {
        yield* resetDb
        // F-CONT-006: `requestWordBuild` reads the `words` row (`selectWord`), so the in-progress state
        // is a `running` `words` row — seeding only `async_word_jobs` stages no longer blocks the build.
        yield* seedUnreadyWord(EN, 'lacuna', 'running')

        const error = yield* buildWord(EN, 'lacuna').pipe(Effect.flip)
        expect(error._tag).toBe('WordBuildInProgressError')
      }),
    )
  })

  describe('GET /api/words/:language/search', () => {
    it.effect('→ only local words matching q, each carrying a status (AC-1)', () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* seedReadyWord(EN, 'lacuna')
        yield* seedReadyWord(EN, 'lagoon')
        // Negative control: `q` matches `word` OR `gloss` (= `core_definition`), so pin ghost's gloss
        // clear of the needle — a faker-random one could contain "la" and wrongly match.
        yield* seedReadyWord(EN, 'ghost', { coreDefinition: 'a spectre or phantom' })

        const page = yield* search(EN, { q: 'la' })
        const words = page.items.map((item) => item.word).sort()
        expect(words).toEqual(['lacuna', 'lagoon'])
        // The API owns only that each item carries the server-computed discriminant over the wire; the
        // ready/building `Word` leaf shape is owned by core's word.schema.test.ts, so assert status.
        for (const item of page.items) expect(item.status).toBe('succeeded')
      }),
    )

    it.effect('→ numbered pages carry the page envelope + a total-spanning pageCount (AC-5)', () =>
      Effect.gen(function* () {
        yield* resetDb
        for (const w of ['alpha', 'bravo', 'delta']) yield* seedReadyWord(EN, w)

        const first = yield* search(EN, { page: 1, limit: 2 })
        expect(first.items).toHaveLength(2)
        expect(first.pagination).toEqual({ page: 1, limit: 2, total: 3, pageCount: 2 })

        const second = yield* search(EN, { page: 2, limit: 2 })
        expect(second.items).toHaveLength(1)
        expect(second.pagination).toEqual({ page: 2, limit: 2, total: 3, pageCount: 2 })

        // Every seed appears exactly once across the two pages (recency order proven at the repo).
        const paged = [...first.items, ...second.items].map((item) => item.word)
        expect(new Set(paged)).toEqual(new Set(['alpha', 'bravo', 'delta']))
      }),
    )

    // F-CONT-006 semantics: `q` matches `word` across ALL lifecycle states, but the gloss
    // (`core_definition`) branch is ready-only (a building row's content is NULL). A ready item is the
    // full `ReadyWord` leaf; a building item carries only identity + status. Substring over word + gloss.
    it.effect('→ q matches the word in every state; content carried only when ready (AC-8)', () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* seedReadyWord(EN, 'lantern', { coreDefinition: 'a portable light' })
        yield* seedUnreadyWord(EN, 'lantana', 'running') // matches on `word`, still building
        // A ghost whose word misses "lant" but whose gloss happens to contain it must NOT match on gloss
        // once building — but this one is ready, so it CAN match on gloss. Pin its word clear + gloss to
        // "lant..." to prove the ready gloss branch is live.
        yield* seedReadyWord(EN, 'beacon', { coreDefinition: 'a lantern-lit signal' })

        const page = yield* search(EN, { q: 'lant' })
        expect(page.items.map((i) => i.word).sort()).toEqual(['beacon', 'lantana', 'lantern'])
        const lantern = page.items.find((i) => i.word === 'lantern')
        const lantana = page.items.find((i) => i.word === 'lantana')

        // Ready items carry full content under the entity's own field names; the building one omits it.
        expect(lantern).toMatchObject({ status: 'succeeded', coreDefinition: 'a portable light' })
        expect(lantern).toHaveProperty('lexical')
        expect(lantana?.status).toBe('running')
        expect(lantana).not.toHaveProperty('coreDefinition')
        expect(lantana).not.toHaveProperty('lexical')
      }),
    )

    // A building word's NULL gloss must never match a gloss-substring needle — the gloss branch is
    // ready-only by construction (a `pending`/`running`/`failed` row has `core_definition` NULL).
    it.effect('→ a building word never matches on gloss, only on its word (AC-8)', () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* seedReadyWord(EN, 'zephyr', { coreDefinition: 'a gentle breeze' })
        yield* seedUnreadyWord(EN, 'nimbus', 'pending') // gloss NULL — a "breeze" needle can't reach it

        const page = yield* search(EN, { q: 'breeze' })
        expect(page.items.map((i) => i.word)).toEqual(['zephyr'])
      }),
    )

    // Substring match: `q` reaches a mid-word occurrence (which a prefix match could not) and the
    // ready gloss branch — one indexable path for every `q`, no length-based branching.
    it.effect('→ q matches a mid-word substring and the ready gloss (AC-9)', () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* seedReadyWord(EN, 'cat', { coreDefinition: 'plain' }) // word "cat" ✓
        yield* seedReadyWord(EN, 'scatter', { coreDefinition: 'plain' }) // mid-word "cat" ✓
        yield* seedReadyWord(EN, 'dog', { coreDefinition: 'a caterwauling pet' }) // gloss "cat" ✓

        const page = yield* search(EN, { q: 'cat' })
        expect(page.items.map((i) => i.word).sort()).toEqual(['cat', 'dog', 'scatter'])
      }),
    )
  })

  describe('GET /api/words/:language/counts', () => {
    it.effect('→ unfiltered counts equal a full search walk (AC-10)', () =>
      Effect.gen(function* () {
        yield* resetDb
        // 2 succeeded, 1 pending (build requested, worker not started), 1 failed — all `words` rows
        // (F-CONT-006: list/counts read the `words` table directly, so a building word IS a `words` row).
        yield* seedReadyWord(EN, 'lacuna')
        yield* seedReadyWord(EN, 'lagoon')
        yield* seedUnreadyWord(EN, 'nascent', 'pending')
        yield* seedUnreadyWord(EN, 'phantom', 'failed')

        const card = yield* counts(EN)
        expect(card).toEqual({ total: 4, pending: 1, running: 0, succeeded: 2, failed: 1 })

        // The API owns only that /counts equals the per-status tally observable through /search.
        const all = yield* search(EN, { limit: 100 })
        const tally = { total: 0, pending: 0, running: 0, succeeded: 0, failed: 0 }
        for (const item of all.items) {
          tally.total++
          tally[item.status]++
        }
        expect(card).toEqual(tally)
      }),
    )

    it.effect('→ a q filter mirrors search: counts equal a same-q list walk (AC-10)', () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* seedReadyWord(EN, 'lacuna')
        yield* seedReadyWord(EN, 'lacquer')
        yield* seedUnreadyWord(EN, 'lacerate', 'running')
        yield* seedReadyWord(EN, 'ghost')

        // `q` reads the same `wordSearchFilter` the list pages, so the narrowed counts must equal a
        // same-`q` search walk (the robust cross-endpoint invariant — `ghost`'s faker gloss could also
        // reach the substring, so compare to the walk, never a hardcoded total).
        const card = yield* counts(EN, { q: 'lac' })

        const filtered = yield* search(EN, { q: 'lac', limit: 100 })
        const tally = { total: 0, pending: 0, running: 0, succeeded: 0, failed: 0 }
        for (const item of filtered.items) {
          tally.total++
          tally[item.status]++
        }
        expect(card).toEqual(tally)
        // `lacuna`/`lacquer` (succeeded) + `lacerate` (running) match on `word`, so the set is never empty.
        expect(card.succeeded).toBeGreaterThanOrEqual(2)
        expect(card.running).toBeGreaterThanOrEqual(1)
      }),
    )
  })
})
