import { expect, it } from '@effect/vitest'
import {
  ContentEngine,
  type ContentPolicy,
  defaultContentPolicy,
  makeMockContentEngine,
  type StageSlice,
  WordGenerationServiceLive,
  withBuildBudget,
} from '@kotodama/core/content'
import {
  type BuildStagesEntity,
  enumAsyncJobStatus,
  enumFrequencyBand,
  enumJobErrorType,
  enumLanguage,
  enumVisualKind,
  enumWordJobStage,
  type Language,
  WORD_JOB_STAGES,
  type WordJobStage,
} from '@kotodama/core/database'
import { resetDb, TestDatabaseLive } from '@kotodama/core/database/testing'
import { selectWord, selectWords } from '@kotodama/core/repositories'
import { seedUnreadyWord } from '@kotodama/core/repositories/testing'
import { Duration, Effect, Layer, Option } from 'effect'
import { TestClock } from 'effect/testing'
import { buildWord } from '../src/index'

// Two `it.layer` blocks for the one flow, differing only in the ContentEngine double — the mock
// (policy-driven; exercises the stage machine) and a real-shaped fake carrying its own
// `sourceVersions` (exercises provenance threading onto the words row). Each block owns its own
// container, so this costs exactly what two files would.

const EN = enumLanguage.en
const PIPELINE_LENGTH = WORD_JOB_STAGES.length

// The build's precondition, in the new model: `requestWordBuild` seeds one `words` row whose inline
// `stages` are all `pending` (there is no separate job table). Seed it in one write.
const PENDING_STAGES: BuildStagesEntity = WORD_JOB_STAGES.map((stage) => ({
  stage,
  status: enumAsyncJobStatus.pending,
}))
const seedPendingWord = (word: string) =>
  seedUnreadyWord(EN, word, enumAsyncJobStatus.pending, PENDING_STAGES)

// Stages now ride the `words` row (`words.stages`) — read them off `selectWord` (empty if absent).
const readStages = (language: Language, word: string) =>
  selectWord(language, word).pipe(
    Effect.map(
      Option.match({
        onNone: (): BuildStagesEntity => [],
        onSome: (row) => row.stages,
      }),
    ),
  )

// ── Stage machine (mock engine) ──────────────────────────────────────────────────────────────────

// A tiny whole-build budget so the timeout test resolves in milliseconds; every other word builds
// instantly (mock), so they never trip it.
const TEST_BUILD_TIMEOUT = Duration.millis(200)
const SLOW_WORD = 'slowpoke'

// The default policy plus a *faster* slow path than the 30s demo word, so the timeout test stays quick:
// `slowpoke` delays its visuals pass past TEST_BUILD_TIMEOUT — so the whole build overruns — but well
// under the file's 120s ceiling.
const testPolicy: ContentPolicy = (word, stage) =>
  word === SLOW_WORD && stage === enumWordJobStage.enrich_visuals
    ? { kind: 'produce', delayMillis: 1000 }
    : defaultContentPolicy(word, stage)

// buildWord bottoms out at WordGenerationService + DB (the repos `yield* DB`). The generation budget is
// the withBuildBudget decorator's argument — set tiny here so the timeout test is fast — over
// the recipe-as-service Live, over the mock ContentEngine (which drives the stage machine).
const MockEngineLayer = Layer.mergeAll(
  withBuildBudget(TEST_BUILD_TIMEOUT).pipe(
    Layer.provide(WordGenerationServiceLive.pipe(Layer.provide(makeMockContentEngine(testPolicy)))),
  ),
  TestDatabaseLive,
)

const byStage = (stages: BuildStagesEntity) =>
  new Map(stages.map((entry) => [entry.stage, entry.status] as const))

it.layer(MockEngineLayer, { timeout: '120 seconds' })((it) => {
  it.effect(
    'a full run promotes the words row and journals every stage succeeded together (AC-5, integrity AC-1)',
    () =>
      Effect.gen(function* () {
        yield* resetDb
        // Mirror requestWordBuild: a `pending` words row (with its all-pending inline stages) exists
        // before the build runs (F-CONT-006).
        yield* seedPendingWord('lacuna')

        yield* buildWord(EN, 'lacuna')

        // The commit + the inline stages write run as one uninterruptible unit, so the words row and
        // its stages always agree: a committed word is never left `timed_out`/`pending` (integrity AC-1).
        const stages = yield* readStages(EN, 'lacuna')
        expect(stages).toHaveLength(PIPELINE_LENGTH)
        expect(stages.every((stage) => stage.status === enumAsyncJobStatus.succeeded)).toBe(true)

        // ...and promotion produced exactly one ready word with assembled content: the seeded `pending`
        // row was flipped `running` at start and promoted to `succeeded` on commit (row status tracks the
        // build lifecycle, F-CONT-006 AC-4).
        const [word] = yield* selectWords({ language: EN, word: 'lacuna', limit: 1 })
        expect(word?.status).toBe(enumAsyncJobStatus.succeeded)
        // Content is nullable in storage (lifecycle table) but a `succeeded` row has it all (the CHECK).
        expect(word?.coreDefinition?.length).toBeGreaterThan(0)
        expect(word?.visuals?.hero).not.toBeNull()
      }),
  )

  it.effect('flips the whole pipeline running before generation, then succeeded on commit', () =>
    Effect.gen(function* () {
      yield* resetDb
      yield* seedPendingWord('lacuna')

      yield* buildWord(EN, 'lacuna')

      // buildWord flips the row + every stage `running` before generation, then `createWord` lands the
      // all-`succeeded` stages on commit. There is no per-stage `startedAt` to observe the flip through
      // anymore, so the durable proof is the final picture: every stage `succeeded`.
      const stages = yield* readStages(EN, 'lacuna')
      expect(stages).toHaveLength(PIPELINE_LENGTH)
      expect(stages.every((stage) => stage.status === enumAsyncJobStatus.succeeded)).toBe(true)
    }),
  )

  it.effect(
    'a pass failure records the typed error and flips the words row failed (AC-4, AC-5)',
    () =>
      Effect.gen(function* () {
        yield* resetDb
        // Mirror requestWordBuild: a `pending` words row exists before the build runs.
        // `kaboom` is the reserved demo word that fails at enrich_visuals.
        yield* seedPendingWord('kaboom')

        yield* buildWord(EN, 'kaboom')

        const status = byStage(yield* readStages(EN, 'kaboom'))
        // fetch_source runs first (it grounds the rest); the failing pass is recorded `failed`. The
        // enrich passes run concurrently, so the others' post-failure state is indeterminate (succeeded
        // or interrupted) and intentionally unasserted — what matters is the failure is recorded (so a
        // retry is admitted) and no word is promoted (AC-4/AC-5).
        expect(status.get(enumWordJobStage.fetch_source)).toBe(enumAsyncJobStatus.succeeded)
        expect(status.get(enumWordJobStage.enrich_visuals)).toBe(enumAsyncJobStatus.failed)

        // The seeded row is flipped `failed` with content still NULL — never promoted (AC-5 negative), and
        // `failed` is buildable so a later re-request retries (T03b's failed-retry guard).
        const word = yield* selectWord(EN, 'kaboom')
        expect(Option.isSome(word)).toBe(true)
        expect(Option.getOrThrow(word).status).toBe(enumAsyncJobStatus.failed)
        expect(Option.getOrThrow(word).coreDefinition).toBeNull()
      }),
  )

  it.effect('the failed pass records the typed JobErrorEntity (failed)', () =>
    Effect.gen(function* () {
      yield* resetDb
      yield* seedPendingWord('kaboom')

      yield* buildWord(EN, 'kaboom')

      const stages = yield* readStages(EN, 'kaboom')
      const failed = stages.find((stage) => stage.stage === enumWordJobStage.enrich_visuals)
      expect(failed?.error?.type).toBe(enumJobErrorType.failed)
    }),
  )

  it.effect(
    'generation exceeding its budget is interrupted, every stage timed_out — no words row (AC-13, integrity AC-2)',
    () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* seedPendingWord(SLOW_WORD)

        // The mock delay (1s on enrich_visuals) and the build budget (200ms) are both clock-driven;
        // `it.effect` runs on the TestClock, so run on the live clock to let the budget actually elapse.
        yield* TestClock.withLive(buildWord(EN, SLOW_WORD))

        // Generation overran its budget (the budget bounds generation), was interrupted before any
        // commit, and every stage was recorded `timed_out`; nothing was committed, so the row is never
        // promoted — it is flipped `failed` (content NULL), retryable.
        const stages = yield* readStages(EN, SLOW_WORD)
        expect(stages.every((stage) => stage.status === enumAsyncJobStatus.failed)).toBe(true)
        expect(stages.every((stage) => stage.error?.type === enumJobErrorType.timed_out)).toBe(true)

        const word = yield* selectWord(EN, SLOW_WORD)
        expect(Option.isSome(word)).toBe(true)
        expect(Option.getOrThrow(word).status).toBe(enumAsyncJobStatus.failed)
        expect(Option.getOrThrow(word).coreDefinition).toBeNull()
      }),
  )

  it.effect('a not_found pass records the typed not_found error — no words row (AC-12)', () =>
    Effect.gen(function* () {
      yield* resetDb
      // `xyzzy` is the reserved demo word that fails at fetch_source (the first pass) with not_found.
      yield* seedPendingWord('xyzzy')

      yield* buildWord(EN, 'xyzzy')

      const stages = yield* readStages(EN, 'xyzzy')
      const failed = stages.find((stage) => stage.stage === enumWordJobStage.fetch_source)
      expect(failed?.status).toBe(enumAsyncJobStatus.failed)
      expect(failed?.error?.type).toBe(enumJobErrorType.not_found)

      // The first pass failed, so nothing downstream ran and no word was promoted — the row is `failed`.
      const word = yield* selectWord(EN, 'xyzzy')
      expect(Option.isSome(word)).toBe(true)
      expect(Option.getOrThrow(word).status).toBe(enumAsyncJobStatus.failed)
    }),
  )
})

// ── Provenance (real-shaped engine fake) ─────────────────────────────────────────────────────────

const WORD = 'lacuna'

/**
 * One assembled slice per stage — together they decode through `WordEntityInsert`. Build provenance is
 * no longer carried on a slice; it comes off the engine's `sourceVersions` (see `ContentEngineFake`),
 * so these are pure content slices.
 */
const slices: { readonly [S in WordJobStage]: StageSlice<S> } = {
  [enumWordJobStage.fetch_source]: {
    coreDefinition: 'An unfilled space; a gap.',
    lexical: { partOfSpeech: 'noun', register: ['formal'] },
    pronunciation: {
      ipa: '/ləˈkjuːnə/',
      respelling: 'luh-KYOO-nuh',
      audio: { uk: null, us: null },
    },
    sources: [{ index: 1, type: 'wiktionary', title: 'lacuna' }],
  },
  [enumWordJobStage.enrich_etymology]: {
    etymology: {
      summary: 'From Latin lacuna.',
      firstAttested: { year: 1663, language: 'English' },
      origin: { from: 'lacus', to: 'lacuna', gloss: 'lake → hollow' },
      descent: [],
    },
  },
  [enumWordJobStage.enrich_tiers]: {
    tiers: {
      quick: { title: 'Quick', body: 'A gap.', examples: [] },
      everyday: { title: 'Everyday', body: 'A missing part.', examples: [] },
      deep: { title: 'Deep', body: 'An unfilled space.', examples: [] },
      cultural: { title: 'Cultural', body: 'Manuscript studies.', examples: [] },
    },
    relations: { synonyms: [], antonyms: [], family: [] },
    translations: [{ language: 'fr', term: 'lacune' }],
  },
  [enumWordJobStage.enrich_visuals]: {
    visuals: {
      hero: {
        kind: enumVisualKind.hero,
        imageKey: 'visuals/en/lacuna/hero.png',
        prompt: 'hero',
        concept: 'an empty manuscript gap',
      },
      infographic: {
        kind: enumVisualKind.infographic,
        imageKey: 'visuals/en/lacuna/infographic.png',
        prompt: 'infographic',
        concept: 'a labelled gap in a page',
      },
      memes: [],
    },
  },
  [enumWordJobStage.enrich_authors]: {
    authorExamples: [
      {
        author: 'A. Writer',
        authorImageUrl: 'authors/en/lacuna/0.png',
        language: enumLanguage.en,
        isGenerated: false,
        quote: 'Consider the lacuna.',
      },
    ],
    culturalGuide: { timeline: [{ date: '1900', text: 'enters use.' }], notes: [] },
  },
  [enumWordJobStage.final_review]: {
    frequency: { band: enumFrequencyBand.uncommon, trendNote: 'steady', series: [] },
  },
}

// A distinctive provenance so the assertions prove promote threads *the engine's* sourceVersions onto
// the words row (not a hardcoded default).
const FAKE_SOURCE_VERSIONS = {
  model: 'gpt-5.5',
  promptHash: 'fake-prompt-hash-abc123',
  pipeline: 'real-content-engine@0.1',
}

/** A real-engine-shaped fake: a content slice per stage + its own build provenance. */
const ContentEngineFake: Layer.Layer<ContentEngine> = Layer.succeed(
  ContentEngine,
  ContentEngine.of({
    produce: (stage, _language, _word) => Effect.succeed(slices[stage]),
    sourceVersions: FAKE_SOURCE_VERSIONS,
  }),
)

// No timeout decorator here — provenance isn't a timing test, so the recipe-as-service Live over the
// real-shaped fake suffices (generation never overruns).
const ProvenanceLayer = Layer.mergeAll(
  WordGenerationServiceLive.pipe(Layer.provide(ContentEngineFake)),
  TestDatabaseLive,
)

it.layer(ProvenanceLayer, { timeout: '120 seconds' })((it) => {
  it.effect('the six-stage assembly promotes with the engine sourceVersions (AC-7)', () =>
    Effect.gen(function* () {
      yield* resetDb
      yield* seedPendingWord(WORD)

      yield* buildWord(EN, WORD)

      const [word] = yield* selectWords({ language: EN, word: WORD, limit: 1 })
      expect(word).toBeDefined()

      // Provenance threaded from the engine's `sourceVersions`, not smuggled through a stage slice.
      expect(word?.sourceVersions).toEqual(FAKE_SOURCE_VERSIONS)
    }),
  )
})
