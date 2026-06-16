import type { SQL, Table } from 'drizzle-orm'
import { getTableColumns, getTableName, sql } from 'drizzle-orm'

/**
 * Columns no conflict-set may write, ever: `id`/`createdAt` arrive in `excluded` as freshly fired
 * defaults (a new uuid, `now()`) — not the existing row's values — so writing them from `excluded`
 * would rewrite the row's identity and creation time on every upsert. `updatedAt` must stay out
 * because drizzle injects its `$onUpdate` into every conflict set and an explicit entry would
 * override that injection (`buildUpdateSet`: `set[col] ?? onUpdateFn()`).
 */
const STORAGE_ENVELOPE: readonly string[] = ['id', 'createdAt', 'updatedAt']

type ColumnKeys<Tbl extends Table> = keyof Tbl['_']['columns'] & string

type OnConflictSet<Tbl extends Table> = Partial<Record<ColumnKeys<Tbl>, SQL>>

/**
 * The `set` for a merge-patch upsert, read from the **same row you pass to `.values()`** — drizzle's
 * own `.set()` semantics applied to the conflict clause: each column the row carries is set from
 * `excluded` (an explicit `null` clears it), and a column the row omits is left untouched. So
 * `insert(row).onConflictDoUpdate({ target, set: patchOnConflict(table, row) })` inserts-or-patches
 * from one source of truth, with no column list to keep in sync.
 *
 * `undefined` ⇒ "not provided" (the key is skipped, like `.set()`); only `null` clears. A
 * `Schema.NullOr` field always carries its key, so its "no data" arrives as `null` and **clears** —
 * model "absent = keep" with `Schema.optionalKey` (key omitted), never a passed `null`.
 *
 * The storage envelope (`id`, `createdAt`, `updatedAt`) is never written, even when the row carries
 * it ({@link STORAGE_ENVELOPE}); re-setting the conflict-target columns is a harmless no-op
 * (`excluded` equals the existing key there by definition).
 *
 * @example
 * ```ts
 * yield* db.insert(wordsTable).values(content).onConflictDoUpdate({
 *   target: [wordsTable.word, wordsTable.language],
 *   set: patchOnConflict(wordsTable, content),
 * })
 * ```
 */
export const patchOnConflict = <Tbl extends Table>(
  table: Tbl,
  row: Partial<Record<ColumnKeys<Tbl>, unknown>>,
): OnConflictSet<Tbl> => {
  const columns = getTableColumns(table)
  const set: OnConflictSet<Tbl> = {}
  for (const key of Object.keys(row) as ColumnKeys<Tbl>[]) {
    if (row[key] === undefined || STORAGE_ENVELOPE.includes(key)) continue
    const column = columns[key]
    if (!column)
      throw new Error(`patchOnConflict: '${key}' is not a column of '${getTableName(table)}'`)
    set[key] = sql`excluded.${sql.identifier(column.name)}`
  }
  return set
}
