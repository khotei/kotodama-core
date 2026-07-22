import { BunRuntime } from '@effect/platform-bun'
import { faker } from '@faker-js/faker'
import { ConfigProviderLive } from '@kotodama/platform/config'
import { Effect } from 'effect'
import { DatabaseLive, DB } from './db'
import { makeWordInsert } from './factories'
import { enumLanguage, wordsTable } from './index'

// Dev seed. Idempotent via `onConflictDoNothing` on `UNIQUE(word, language)`.
// Run: `bun run --filter '@kotodama/database' db:seed`.
faker.seed(20260604)

const WORDS = ['lacuna', 'ephemeral', 'serendipity', 'petrichor'] as const

const program = Effect.gen(function* () {
  const db = yield* DB

  for (const word of WORDS) {
    const [row] = yield* db
      .insert(wordsTable)
      .values(makeWordInsert({ word, language: enumLanguage.en }))
      .onConflictDoNothing()
      .returning()
    yield* Effect.log(row ? `seed: ${word}` : `seed: ${word} already present, skipping`)
  }

  yield* Effect.log('seed: done')
})

program.pipe(Effect.provide(DatabaseLive), Effect.provide(ConfigProviderLive), BunRuntime.runMain)
