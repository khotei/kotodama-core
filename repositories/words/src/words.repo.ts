import type { EffectDrizzleQueryError, Language, WordInsert, WordRow } from '@lexiai/database'
import { DB, patchOnConflict, wordsTable } from '@lexiai/database'
import { type Arrayable, isArray, toArray } from '@lexiai/utils'
import { and, ilike, inArray } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'

/**
 * Full word content for {@link WordsRepo.save} — every generation column (all NOT NULL bar
 * `frequency`), including the table-defaulted ones: {@link WordInsert} requires them, so a save
 * states its values rather than inheriting a column default on insert (or silently keeping a
 * stored value on regen — under the patch upsert an omitted column is left untouched).
 */
export type WordContent = WordInsert

/**
 * A read over the catalog: each of `id`/`word`/`language` takes a single value or an array, `search` is
 * a case-insensitive prefix match on `word`, and `limit` caps the result. Every read question is one
 * shape of it (the single word is `{ language, word, limit: 1 }` — destructure the row). Rows come back
 * **unordered**.
 */
export type WordsQuery = {
  readonly id?: Arrayable<string>
  readonly word?: Arrayable<string>
  readonly language?: Arrayable<Language>
  readonly search?: string
  readonly limit?: number
}

/**
 * `save`'s input-inferred shape: a single content returns the one upserted row; an array returns a
 * row per item — each saved by its own `INSERT … ON CONFLICT DO UPDATE` (per-row, so rows carrying
 * different optional columns are fine; no transaction, so a batch is not atomic across items).
 */
type SaveWords = {
  (content: WordContent): Effect.Effect<WordRow, EffectDrizzleQueryError>
  (content: readonly WordContent[]): Effect.Effect<readonly WordRow[], EffectDrizzleQueryError>
}

/**
 * The pristine `words` aggregate: a row exists ⇔ the word is ready. Two purely functional methods —
 * `find` reads (filter + `search`; absence is an empty array), `save` creates-or-replaces. The only
 * write takes complete content, so a half-word is not just forbidden but inexpressible.
 *
 * @see `repositories/words/CLAUDE.md`
 */
export class WordsRepo extends Context.Service<
  WordsRepo,
  {
    /** All catalog matches for the query (filter + `search` + `limit`), unordered. */
    readonly find: (query: WordsQuery) => Effect.Effect<WordRow[], EffectDrizzleQueryError>
    /**
     * Save complete word content — insert, or **replace the existing row's content** on
     * `UNIQUE(word, language)` (so first-gen and regen are one idempotent call). Every carried
     * column lands verbatim: the content is the whole truth, so `frequency: null` clears a stored
     * frequency. A single content returns the row; an array returns a row per item, each its own
     * upsert (no transaction — a batch is not atomic across items).
     */
    readonly save: SaveWords
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

    // Overloaded type can't be implemented by an annotated arrow (union return), so assert the bridge.
    const save = ((content: Arrayable<WordContent>) =>
      Effect.gen(function* () {
        const rows: WordRow[] = []
        // One INSERT … ON CONFLICT per content: the conflict set is derived from each row's own keys
        // (merge-patch via `patchOnConflict`), so a batch whose rows carry different optional columns
        // works out of the box — a single statement's one shared SET could not. No transaction: a
        // failing row leaves earlier ones saved (CLAUDE.md).
        for (const c of toArray(content)) {
          rows.push(
            ...(yield* db
              .insert(wordsTable)
              .values(c)
              .onConflictDoUpdate({
                target: [wordsTable.word, wordsTable.language],
                set: patchOnConflict(wordsTable, c),
              })
              .returning()),
          )
        }

        if (isArray(content)) return rows
        const [first] = rows
        if (!first) return yield* Effect.die(new Error('WordsRepo.save: upsert returned no row'))
        return first
      })) as SaveWords

    return WordsRepo.of({ find, save })
  }),
)
