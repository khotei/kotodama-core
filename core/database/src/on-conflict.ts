import type { SQL, Table } from 'drizzle-orm'
import { getTableColumns, getTableName, sql } from 'drizzle-orm'

type ColumnKeys<Tbl extends Table> = keyof Tbl['_']['columns'] & string

type OnConflictSet<Tbl extends Table> = Partial<Record<ColumnKeys<Tbl>, SQL>>

/**
 * Columns no conflict-set may write, ever: `id`/`createdAt` arrive in `excluded` as freshly fired
 * defaults (a new uuid, `now()`) — not the existing row's values — so writing them would rewrite
 * the row's identity and creation time on every upsert. `updatedAt` must stay out because drizzle
 * injects its `$onUpdate` into every conflict set and an explicit entry would override it.
 */
const STORAGE_ENVELOPE: readonly string[] = ['id', 'createdAt', 'updatedAt']

/**
 * The `set` for a merge-patch upsert, derived from the same row passed to `.values()`: each column
 * the row carries is set from `excluded` (an explicit `null` clears it), an omitted column is left
 * untouched — no column list to keep in sync.
 *
 * `undefined` ⇒ key skipped; only `null` clears. A `Schema.NullOr` field always carries its key,
 * so its "no data" arrives as `null` and **clears** — model "absent = keep" with
 * `Schema.optionalKey`, never a passed `null`.
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
