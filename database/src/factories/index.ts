/** Own subpath so the prod `schema/` → `db.ts` graph never imports faker (Biome import-ban). */
export * from './async-word-jobs.factory'
export * from './words.factory'
