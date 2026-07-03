import { PgClient } from '@effect/sql-pg'
import { DatabaseUrl } from '@kotodama/config'
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { Context, Effect, Layer } from 'effect'
import { relations } from '../schema'

/**
 * Provide ConfigProviderLive at the entrypoint/tests for the repo-root .env;
 * otherwise the default provider reads process.env only.
 *
 * @see @.claude/rules/config.md
 */
export const PgClientLive = PgClient.layerConfig({ url: DatabaseUrl })

const dbEffect = PgDrizzle.make({ relations }).pipe(Effect.provide(PgDrizzle.DefaultServices))

export class DB extends Context.Service<DB, Effect.Success<typeof dbEffect>>()(
  '@kotodama/database/DB',
) {}

export const DBLive = Layer.effect(DB, dbEffect)
export const DatabaseLive = DBLive.pipe(Layer.provide(PgClientLive))
