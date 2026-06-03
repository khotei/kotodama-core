/**
 * `@lexiai/database` public surface: the Drizzle connection layers plus the
 * schema (tables, relations, derived row-schemas). Repositories yield `DB`;
 * app entrypoints provide `DatabaseLive` (or `DBLive` + their own `PgClient`).
 */
export * from '../schema'
export * from './db'
