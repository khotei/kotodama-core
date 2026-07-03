import type { EffectDrizzleQueryError, Language, WordInsert, WordRow } from '@lexiai/database'
import { DB, patchOnConflict, wordsTable } from '@lexiai/database'
import { and, ilike, inArray } from 'drizzle-orm'
import { Array as Arr, Effect, Option } from 'effect'

type Arrayable<T> = T | readonly T[]

/**
 * The {@link upsertWords} payload — identity (the conflict key) required, everything else an
 * optional patch key (omitted = keep, carried = lands verbatim, `null` clears).
 *
 * `status` has no column default, so a write whose INSERT arm can fire (a not-yet-seeded word)
 * must state it — the type can't express that; a status-less first insert fails at the engine.
 */
export type WordUpsert = Pick<WordInsert, 'word' | 'language'> &
  Partial<Omit<WordInsert, 'word' | 'language'>>

type UpsertWords = {
  (content: WordUpsert): Effect.Effect<WordRow, EffectDrizzleQueryError, DB>
  (content: readonly WordUpsert[]): Effect.Effect<readonly WordRow[], EffectDrizzleQueryError, DB>
}

// `search` is a case-insensitive PREFIX match; rows come back unordered.
export type WordQuery = {
  readonly id?: Arrayable<string>
  readonly word?: Arrayable<string>
  readonly language?: Arrayable<Language>
  readonly search?: string
  readonly limit?: number
}

export const selectWords = Effect.fnUntraced(function* (query: WordQuery) {
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

export const selectWord = Effect.fnUntraced(function* (language: Language, word: string) {
  const [wordRow] = yield* selectWords({ language, word, limit: 1 })
  return Option.fromNullishOr(wordRow)
})

/**
 * The one word write — insert, or patch the existing row on `UNIQUE(word, language)` **in place**
 * (id preserved, never an INSERT/DELETE pair). Unguarded and total by design: which states a write
 * may overwrite is the gates' policy, and the DB `CHECK` makes a succeeded half-word
 * unrepresentable no matter what a caller passes.
 */
// Overloaded type can't be implemented by an annotated arrow (union return), so assert the bridge.
export const upsertWords = ((content: Arrayable<WordUpsert>) =>
  Effect.gen(function* () {
    const db = yield* DB
    const rows: WordRow[] = []
    // One statement per item — rows carrying different optional columns can't share one SET.
    // No transaction: a failing item leaves earlier ones saved.
    for (const c of Arr.ensure(content)) {
      rows.push(
        ...(yield* db
          .insert(wordsTable)
          // `status` is only required on the INSERT arm — a shape `.values()`' type can't express,
          // so assert past it; a status-less first insert fails at the engine.
          .values(c as WordInsert)
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

/**
 * Single-word convenience over {@link upsertWords} — the identity parameters always win over any
 * `word`/`language` keys inside `contentPatch`.
 */
export const upsertWord = (
  language: Language,
  word: string,
  contentPatch: Omit<WordUpsert, 'word' | 'language'>,
) => upsertWords({ ...contentPatch, word, language })
