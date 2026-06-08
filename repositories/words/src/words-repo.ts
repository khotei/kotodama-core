import type { EffectDrizzleQueryError, Language, SqlError, WordRow } from '@lexiai/database'
import { DB, wordsTable } from '@lexiai/database'
import { isReadonlyArray, toArray } from '@lexiai/utils'
import { and, eq, ilike, inArray } from 'drizzle-orm'
import { Context, Data, Effect, Layer, Option } from 'effect'

/** Full word content for {@link WordsRepo.create} — every generation column (all NOT NULL bar `frequency`). */
export type WordContent = typeof wordsTable.$inferInsert

/** A partial field update for {@link WordsRepo.patch}. The identity (`id`/`word`/`language`) is not patchable. */
export type WordPatch = Partial<Omit<WordContent, 'id' | 'word' | 'language'>>

/**
 * A read over the catalog: each of `id`/`word`/`language` takes a single value or an array, `search` is
 * a case-insensitive prefix match on `word`, and `limit` caps the result. The single flexible read
 * behind `find` (all matches) and `findOne` (the first). Rows come back **unordered**.
 */
export type WordsQuery = {
  readonly id?: string | readonly string[]
  readonly word?: string | readonly string[]
  readonly language?: Language | readonly Language[]
  readonly search?: string
  readonly limit?: number
}

export class WordNotFoundError extends Data.TaggedError('WordNotFoundError')<{
  readonly language: Language
  readonly word: string
}> {}

/**
 * `create`'s input-inferred shape: a single content returns the one upserted row; an array returns a
 * row per item, applied **atomically** in a transaction (hence the extra `SqlError` on that overload —
 * a mid-batch failure rolls the whole batch back).
 */
type CreateWords = {
  (content: WordContent): Effect.Effect<WordRow, EffectDrizzleQueryError>
  (
    content: readonly WordContent[],
  ): Effect.Effect<readonly WordRow[], EffectDrizzleQueryError | SqlError>
}

/**
 * The pristine `words` aggregate: a row exists ⇔ the word is ready, so reads return `Option` (absence
 * is not a failure) and writes only ever produce a complete row. Four deep methods: `find`/`findOne`
 * read (with filter + `search`), `create` is the idempotent promotion (upsert), `patch` updates an
 * already-complete row.
 *
 * @see `repositories/words/CLAUDE.md`
 */
export class WordsRepo extends Context.Service<
  WordsRepo,
  {
    /** All catalog matches for the query (filter + `search` + `limit`), unordered. */
    readonly find: (query: WordsQuery) => Effect.Effect<WordRow[], EffectDrizzleQueryError>
    /** The first match, or `Option.none` — absence is not a failure. */
    readonly findOne: (
      query: WordsQuery,
    ) => Effect.Effect<Option.Option<WordRow>, EffectDrizzleQueryError>
    /**
     * Promote complete word content — insert, or **replace in place** on `UNIQUE(word, language)` (so
     * first-gen and regen are one idempotent call). A single content returns the row; an array returns a
     * row per item, applied atomically in a transaction.
     */
    readonly create: CreateWords
    /**
     * Update fields on an **existing** word (e.g. `frequency`); never creates a row, so the pristine
     * invariant holds. Absent word ⇒ {@link WordNotFoundError}.
     */
    readonly patch: (
      language: Language,
      word: string,
      patch: WordPatch,
    ) => Effect.Effect<WordRow, EffectDrizzleQueryError | WordNotFoundError>
  }
>()('@lexiai/repositories-words/WordsRepo') {}

export const WordsRepoLive = Layer.effect(
  WordsRepo,
  Effect.gen(function* () {
    const db = yield* DB

    const find: WordsRepo['Service']['find'] = Effect.fnUntraced(function* (query) {
      const ids = toArray(query.id)
      const words = toArray(query.word)
      const languages = toArray(query.language)
      const select = db
        .select()
        .from(wordsTable)
        .where(
          and(
            ids.length > 0 ? inArray(wordsTable.id, ids) : undefined,
            words.length > 0 ? inArray(wordsTable.word, words) : undefined,
            languages.length > 0 ? inArray(wordsTable.language, languages) : undefined,
            query.search ? ilike(wordsTable.word, `${query.search}%`) : undefined,
          ),
        )
        .$dynamic()
      return yield* query.limit === undefined ? select : select.limit(query.limit)
    })

    const findOne: WordsRepo['Service']['findOne'] = Effect.fnUntraced(function* (query) {
      const [row] = yield* find({ ...query, limit: 1 })
      return Option.fromNullishOr(row)
    })

    // Executor threaded so the array path runs on `tx` (atomic). `db` (EffectPgDatabase) and the tx
    // (EffectPgTransaction) are siblings under PgEffectDatabase — neither assignable to the other — so
    // accept the union; both expose the same `.insert().onConflictDoUpdate().returning()` builder.
    type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

    // Idempotent on UNIQUE(word, language): re-setting the conflict-target columns to their own values
    // is a harmless no-op, so the whole `content` is the update set (first-gen inserts, regen replaces).
    const createOne = (exec: Executor, content: WordContent) =>
      Effect.gen(function* () {
        const [row] = yield* exec
          .insert(wordsTable)
          .values(content)
          .onConflictDoUpdate({ target: [wordsTable.word, wordsTable.language], set: content })
          .returning()
        if (!row) return yield* Effect.die(new Error('WordsRepo.create: upsert returned no row'))
        return row
      })

    // Overloaded type can't be implemented by an annotated arrow (union return), so assert the bridge.
    const create = ((content: WordContent | readonly WordContent[]) =>
      isReadonlyArray(content)
        ? db.transaction((tx) => Effect.forEach(content, (c) => createOne(tx, c)))
        : createOne(db, content)) as CreateWords

    const patch: WordsRepo['Service']['patch'] = Effect.fnUntraced(
      function* (language, word, patch) {
        // drizzle rejects an empty `.set({})`; an empty patch is just an existence check.
        if (Object.keys(patch).length === 0) {
          const existing = yield* findOne({ language, word })
          return yield* Option.match(existing, {
            onNone: () => Effect.fail(new WordNotFoundError({ language, word })),
            onSome: Effect.succeed,
          })
        }
        const [row] = yield* db
          .update(wordsTable)
          .set(patch)
          .where(and(eq(wordsTable.word, word), eq(wordsTable.language, language)))
          .returning()
        if (!row) return yield* Effect.fail(new WordNotFoundError({ language, word }))
        return row
      },
    )

    return WordsRepo.of({ find, findOne, create, patch })
  }),
)
