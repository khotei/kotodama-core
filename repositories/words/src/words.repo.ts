import type { EffectDrizzleQueryError, Language, WordInsert, WordRow } from '@lexiai/database'
import { DB, patchOnConflict, wordsTable } from '@lexiai/database'
import { and, ilike, inArray } from 'drizzle-orm'
import { Array as Arr, Effect, Option } from 'effect'

/** A single value or a readonly batch of them — the repo's single-or-array filter/payload idiom. */
type Arrayable<T> = T | readonly T[]

/**
 * Full word content for {@link upsertWords} — every generation column (all NOT NULL bar
 * `frequency`), including the table-defaulted ones: {@link WordInsert} requires them, so an upsert
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
 * `upsertWords`' input-inferred shape: a single content returns the one upserted row; an array returns
 * a row per item — each by its own `INSERT … ON CONFLICT DO UPDATE` (per-row, so rows carrying
 * different optional columns are fine; no transaction, so a batch is not atomic across items).
 */
type UpsertWords = {
  (content: WordContent): Effect.Effect<WordRow, EffectDrizzleQueryError, DB>
  (content: readonly WordContent[]): Effect.Effect<readonly WordRow[], EffectDrizzleQueryError, DB>
}

/**
 * Read the `words` catalog — all matches for the query (filter + `search` + `limit`), **unordered**;
 * absence is an empty array. A raw `SELECT` over `DB` (which it `yield*`s, so `DB` rides the caller's
 * `R`); the `Option`-lifting single-word read over it is {@link selectWord}. A bare persistence
 * function (the `select` verb marks the layer), not a `Context.Service` — see "Service vs plain
 * function" in `.claude/rules/effect-conventions.md`.
 *
 * @see `repositories/words/CLAUDE.md`
 */
export const selectWords = Effect.fnUntraced(function* (query: WordsQuery) {
  const db = yield* DB
  const ids = query.id === undefined ? [] : Arr.ensure(query.id)
  const words = query.word === undefined ? [] : Arr.ensure(query.word)
  const languages = query.language === undefined ? [] : Arr.ensure(query.language)
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

/**
 * Read one word by identity — `Option.some(WordRow)` when a `words` row exists for `(language, word)`,
 * else `Option.none`: absence is a value, never an error (deep-modules §6), which is why it is
 * `selectWord`, not a throwing get. The single-word read over {@link selectWords} (`{ language, word,
 * limit: 1 }`, destructured) that lifts the hit into `Option`; its `DB` requirement rides the caller's
 * `R`. A bare persistence function, like its siblings.
 *
 * @see `repositories/words/CLAUDE.md`
 */
export const selectWord = Effect.fnUntraced(function* (language: Language, word: string) {
  const [wordRow] = yield* selectWords({ language, word, limit: 1 })
  return Option.fromNullishOr(wordRow)
})

/**
 * Upsert complete word content — insert, or **replace the existing row's content** on
 * `UNIQUE(word, language)` (so first-gen and regen are one idempotent call). Every carried column
 * lands verbatim: the content is the whole truth, so `frequency: null` clears a stored frequency. A
 * single content returns the row; an array returns a row per item, each its own upsert (no
 * transaction — a batch is not atomic across items). The only write takes complete content, so a
 * half-word is not just forbidden but inexpressible. A bare persistence function (the `upsert` verb
 * marks the layer), not a `Context.Service`.
 *
 * @see `repositories/words/CLAUDE.md`
 */
// Overloaded type can't be implemented by an annotated arrow (union return), so assert the bridge.
export const upsertWords = ((content: Arrayable<WordContent>) =>
  Effect.gen(function* () {
    const db = yield* DB
    const rows: WordRow[] = []
    // One INSERT … ON CONFLICT per content: the conflict set is derived from each row's own keys
    // (merge-patch via `patchOnConflict`), so a batch whose rows carry different optional columns
    // works out of the box — a single statement's one shared SET could not. No transaction: a
    // failing row leaves earlier ones saved (CLAUDE.md).
    for (const c of Arr.ensure(content)) {
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

    if (Arr.isArray(content)) return rows
    const [first] = rows
    if (!first) return yield* Effect.die(new Error('upsertWords: upsert returned no row'))
    return first
  })) as UpsertWords
