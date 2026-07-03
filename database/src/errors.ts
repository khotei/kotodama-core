// Re-exported so `repositories/*` name the error channel through `@kotodama/database`, not
// `drizzle-orm`. Every query surfaces `EffectDrizzleQueryError`; `db.transaction` adds `SqlError`.
import type { SqlError as SqlErrorNamespace } from 'effect/unstable/sql'

export type {
  EffectDrizzleError,
  EffectDrizzleQueryError,
  EffectTransactionRollbackError,
} from 'drizzle-orm/effect-core'

/** Effect publishes `SqlError` only as a namespace — flatten the class to a clean type here. */
export type SqlError = SqlErrorNamespace.SqlError
