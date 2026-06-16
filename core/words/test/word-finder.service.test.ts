import { expect, it } from '@effect/vitest'
import { enumLanguage } from '@lexiai/database'
import { makeWordInsert } from '@lexiai/database/factories'
import { resetDb, TestDatabaseLive } from '@lexiai/database/testing'
import { WordsRepo, WordsRepoLive } from '@lexiai/repositories-words'
import { Effect, Layer, Option } from 'effect'
import { WordFinder, WordFinderLive } from '../src/index'

const TestLayer = WordFinderLive.pipe(
  Layer.provideMerge(WordsRepoLive),
  Layer.provideMerge(TestDatabaseLive),
)

const EN = enumLanguage.en
const WORD = 'lacuna'

it.layer(TestLayer, { timeout: '120 seconds' })((it) => {
  it.effect('absent word → Option.none (a value, not a failure)', () =>
    Effect.gen(function* () {
      yield* resetDb
      const finder = yield* WordFinder
      expect(Option.isNone(yield* finder.find(EN, WORD))).toBe(true)
    }),
  )

  it.effect('existing word → Some(the saved row)', () =>
    Effect.gen(function* () {
      yield* resetDb
      const words = yield* WordsRepo
      const finder = yield* WordFinder
      const saved = yield* words.save(makeWordInsert({ word: WORD, language: EN }))

      // WordFinder lifts WordsRepo.find into Option; it owns only that a hit is Some(the same row).
      // Row content fidelity is owned below it (words.repo.test.ts / db.test.ts) — assert identity only.
      const row = Option.getOrThrow(yield* finder.find(EN, WORD))
      expect(row.id).toBe(saved.id)
    }),
  )
})
