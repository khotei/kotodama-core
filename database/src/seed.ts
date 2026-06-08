import { BunRuntime } from '@effect/platform-bun'
import { faker } from '@faker-js/faker'
import { ConfigProviderLive } from '@lexiai/config'
import { Effect } from 'effect'
import { DatabaseLive, DB } from './db'
import { makeAsyncWordJobInsert, makeWordInsert } from './factories'
import {
  asyncWordJobsTable,
  enumAsyncJobStatus,
  enumLanguage,
  wordJobStage,
  wordsTable,
} from './index'

// Dev seed. Idempotent via `onConflictDoNothing` on `UNIQUE(word, language)`.
// Run: `bun run --filter '@lexiai/database' db:seed`.
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
    if (!row) {
      yield* Effect.log(`seed: ${word} already present, skipping`)
      continue
    }

    // A completed generation: every stage row succeeded.
    yield* db.insert(asyncWordJobsTable).values(
      wordJobStage.enumValues.map((stage) =>
        makeAsyncWordJobInsert({
          word,
          language: enumLanguage.en,
          stage,
          status: enumAsyncJobStatus.succeeded,
          result: { note: faker.lorem.sentence() },
        }),
      ),
    )

    yield* Effect.log(`seed: ${word} + completed run`)
  }

  yield* Effect.log('seed: done')
})

program.pipe(Effect.provide(DatabaseLive), Effect.provide(ConfigProviderLive), BunRuntime.runMain)
