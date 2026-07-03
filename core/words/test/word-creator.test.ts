import { describe, expect, it } from '@effect/vitest'
import { MockContentEngine, WordGenerationServiceLive } from '@lexiai/core-content'
import { enumLanguage } from '@lexiai/database'
import { resetDb, TestDatabaseLive } from '@lexiai/database/testing'
import { selectWord } from '@lexiai/repositories-words'
import { seedUnreadyWord } from '@lexiai/repositories-words/testing'
import { Effect, Layer, Option } from 'effect'
import { createWord } from '../src/word-creator'

const EN = enumLanguage.en

// createWord generates (mock) then promotes — an `upsertWord` of full content + succeeded over the
// already-seeded row. Real generation of mock content + a real Testcontainers DB.
const GenerationLive = WordGenerationServiceLive.pipe(Layer.provide(MockContentEngine))

describe('createWord', () => {
  it.layer(Layer.mergeAll(TestDatabaseLive, GenerationLive), { timeout: '120 seconds' })((it) => {
    it.effect('promotes the seeded row to succeeded + content in place (AC-5)', () =>
      Effect.gen(function* () {
        yield* resetDb
        // The use-case (T05) seeds the pending row before generation; createWord only promotes it.
        const seeded = yield* seedUnreadyWord(EN, 'lacuna')
        expect(seeded.status).toBe('pending')
        expect(seeded.coreDefinition).toBe(null)

        const promoted = yield* createWord(EN, 'lacuna')
        expect(promoted.status).toBe('succeeded')
        expect(promoted.word).toBe('lacuna')
        // A single UPDATE, not an INSERT/DELETE pair — the row id is preserved.
        expect(promoted.id).toBe(seeded.id)
        // Full content landed (a content column the CHECK requires when succeeded).
        expect(promoted.coreDefinition).not.toBe(null)

        // The store holds exactly the promoted row.
        const readBack = yield* selectWord(EN, 'lacuna')
        expect(Option.getOrThrow(readBack).status).toBe('succeeded')
      }),
    )
  })
})
