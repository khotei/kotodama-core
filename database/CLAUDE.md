# database — `@lexiai/database`

Drizzle schema, relations, migrations, seed. Owns the SQL layer.

- **May import:** `@lexiai/*` packages only (`effect`, `@effect/sql-pg`, drizzle).
- **MUST NOT import:** `core/*`, `repositories/*`, `apps/*`. No HTTP code here.
- `db:*` scripts are echo placeholders until a downstream feature wires Drizzle.
