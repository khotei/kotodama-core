/** Own subpath so the prod `schema/` → `db.ts` graph never imports faker (Biome import-ban). */
export * from './words.factory'
