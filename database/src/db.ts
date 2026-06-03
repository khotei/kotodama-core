import { PgClient } from '@effect/sql-pg'
import { DatabaseUrl } from '@lexiai/config'
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { Context, Effect, Layer } from 'effect'
import { relations } from '../schema'

// Wiring follows repos/drizzle/integration-tests/tests/pg/effect-sql.test.ts
// (not orm.drizzle.team, which still shows the Effect-v3 Context.Tag shapes).

// URL via @lexiai/config's DatabaseUrl, so the env key + redaction live in one
// place. Provide ConfigProviderLive at the entrypoint/tests for the repo-root
// .env; otherwise the default provider reads process.env only. See config.md.
export const PgClientLive = PgClient.layerConfig({ url: DatabaseUrl })

// make needs PgClient + EffectLogger + EffectCache; DefaultServices is the no-op
// logger/cache, leaving PgClient as the only outstanding requirement.
const dbEffect = PgDrizzle.make({ relations }).pipe(Effect.provide(PgDrizzle.DefaultServices))

// Context.Service (not Context.Tag) per the rule + the vendored test.
export class DB extends Context.Service<DB, Effect.Success<typeof dbEffect>>()(
  '@lexiai/database/DB',
) {}

export const DBLive = Layer.effect(DB, dbEffect) // needs a PgClient
export const DatabaseLive = DBLive.pipe(Layer.provide(PgClientLive)) // self-contained
