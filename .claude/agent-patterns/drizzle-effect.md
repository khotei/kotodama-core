# Drizzle ⇄ Effect — project pattern notes

Project-local cheat sheet for Kotodama's two mandated Drizzle integrations. **The source of truth
is the vendored `rc` source**, not this file and not the web docs (which still show Effect v3).
There is **no Drizzle `LLMS.md`** — this file is the entry point. The *mandate* is
`.claude/rules/drizzle-effect.md`.

- Source (vendored, `drizzle-orm@v1.0.0-rc.3`):
  - `repos/drizzle/drizzle-orm/src/effect-postgres/` — `driver.ts` (`PgDrizzle.make`,
    `makeWithDefaults`, `DefaultServices`), `session.ts`, `codecs.ts`, `index.ts`.
  - `repos/drizzle/drizzle-orm/src/effect-schema/` — `schema.ts`, `column.ts`, `index.ts`,
    `README.md` (worked example), `schema.types.ts`.
  - `repos/drizzle/drizzle-orm/src/pg-core/` — `pgTable`, column types, `effect/` session.
- Tests/examples: `repos/drizzle/integration-tests/tests/validators/effect-schema/pg.test.ts`
  (createSelectSchema/Insert/Update over pg) and `repos/drizzle/integration-tests/tests/pg/`
  (real schema, relations, migrations — ignore the bare-driver connection boilerplate at the top).
- Use `effect/Schema` for refinements — **never Zod**. Generated schemas stay in `database/`
  (they `import 'drizzle-orm'`).

## Schema derivation — `drizzle-orm/effect-schema` (NOT used in this repo)

Kotodama deleted its derived `<Entity>Schema`s — `createSelectSchema` erases jsonb `$type` to opaque
`Json`, so repos return `$inferSelect` rows and runtime validation decodes through hand-authored
`effect/Schema` structs (`.claude/rules/drizzle-effect.md` § "Why there are NO derived row
schemas"). The upstream API, for reading the vendored source / a future genuine need:

```ts
// Generated schemas import 'drizzle-orm' — backend-only if ever reintroduced.
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import { createSelectSchema, createInsertSchema } from 'drizzle-orm/effect-schema'
import { Schema } from 'effect'

export const wordsTable = pgTable('words', {
  id: serial('id').primaryKey(),
  text: text('text').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type WordRow = typeof wordsTable.$inferSelect // typed row — repo return type
export const WordSchema = createSelectSchema(wordsTable)
// Refine BEFORE columns become nullable/optional; or override outright with an effect/Schema.
// effect v4 refines via `.check(Schema.isMinLength(1))` — NOT the v3 `.pipe(Schema.minLength(1))`.
export const WordSchemaInsert = createInsertSchema(wordsTable, {
  text: (schema) => schema.check(Schema.isMinLength(1)),
})
```

## DB layer — `drizzle-orm/effect-postgres`

The real implementation is **`database/src/db.ts`** — copy from there, not from web docs
(still Effect v3: `@effect/sql-drizzle`, `Context.Tag('DB')`). The URL comes from
`@kotodama/platform/config`'s `DatabaseUrl`, resolved from the active `ConfigProvider`.

```ts
// database/src/db.ts
import { PgClient } from '@effect/sql-pg'
import { DatabaseUrl } from '@kotodama/platform/config'
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { Context, Effect, Layer } from 'effect'
import { relations } from '../schema'

// Config-driven (prod); resolves DATABASE_URL from the active ConfigProvider.
export const PgClientLive = PgClient.layerConfig({ url: DatabaseUrl })

// make needs PgClient + EffectLogger + EffectCache; DefaultServices = no-op logger/cache.
const dbEffect = PgDrizzle.make({ relations }).pipe(Effect.provide(PgDrizzle.DefaultServices))

// Class-syntax Context.Service (NOT Context.Tag — v4 settled on Context.Service).
export class DB extends Context.Service<DB, Effect.Success<typeof dbEffect>>()(
  '@kotodama/core/database/DB',
) {}

export const DBLive = Layer.effect(DB, dbEffect) // needs a PgClient
export const DatabaseLive = DBLive.pipe(Layer.provide(PgClientLive)) // self-contained
```

```ts
// repositories/* — yield the service; never construct drizzle(...) yourself.
const findById = Effect.fnUntraced(function* (id: string) {
  const db = yield* DB
  return yield* db.query.wordsTable.findFirst({ where: { id } })
})
```

## Lifecycle entities — permissive row → strict contract

Mandate: `@.claude/rules/drizzle-effect.md` (§ "Lifecycle entities"). The drizzle-derived
row is permissive (nullable content while `pending`); the **public contract** is a
discriminated union decoded from it, so "ready ⇒ content present" is *enforced at decode*,
not exposed as optional fields. (All names verified in `repos/effect-smol` `Schema.ts`.)

```ts
import { Effect, Schema } from 'effect'
import { WordSchema } from './words/words.schemas' // permissive, drizzle-derived (nullable content)

// Public contract: matchable union; the Ready variant's fields are REQUIRED.
const Word = Schema.TaggedUnion({
  Pending: { term: Schema.String },
  Ready: { term: Schema.String, explanation: Schema.String, readyAt: Schema.Date },
  Failed: { term: Schema.String, reason: Schema.String },
})

// Bridge row → union; decode FAILS a `ready` row missing its content.
export const WordFromRow = WordSchema.pipe(
  Schema.decodeTo(
    Word,
    Schema.transformOrFail({
      decode: (row) =>
        row.status === 'ready' && (row.explanation == null || row.readyAt == null)
          ? Effect.fail(/* Schema Issue: ready row missing content */ undefined as never)
          : Effect.succeed(/* map row → { _tag: 'Ready'|'Pending'|'Failed', … } */),
      encode: (w) => Effect.succeed(/* map union → nullable row */),
    }),
  ),
)
// Consumers: Word.match({ Pending, Ready, Failed }) — Ready branch fields are non-optional.
```

Stronger storage variant: split content into a 1:1 `word_details` table (exists only when
`ready`) so the parent stays lean + all-`NOT NULL`. Deferred to the word-generation feature.

## Avoid

- A bare `drizzle(...)` / `drizzle-orm/node-postgres` driver, or a hand-rolled `PgClient`, in
  `repositories/*` — go through the `effect-postgres` layer.
- `import 'drizzle-orm'` (or a generated row-schema) outside `database/` — hand-author a
  plain `effect/Schema` if another layer needs the shape.
- Copying the web docs verbatim (`@effect/sql-drizzle`, `Context.Tag('DB')`, `@effect/sql/SqlError`)
  — they are Effect v3. Read the vendored `rc` source for exact signatures.
