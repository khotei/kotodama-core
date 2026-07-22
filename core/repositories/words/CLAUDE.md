# repositories/words — `@kotodama/core/repositories`

Bare persistence functions over the `words` lifecycle table — no `WordsRepo` service (owns no
resource, never test-swapped; the swap point is `DB` — see "Service vs plain function" in
`.claude/rules/effect-conventions.md`). Reads: `selectWords` / `selectWord`; write: `upsertWords`
+ its single-word convenience `upsertWord` (`src/words.repo.ts`). The Unified Word Query reads:
`searchWords` (`src/words-search.repo.ts`) + `selectWordCounts` (`src/words-counts.repo.ts`). `search` is
the repo verb for a filtered, ordered, paged read — a DB verb distinct from `select` (see
`.claude/rules/naming.md`). Types are the contract; read the source — this file is only what the
code can't show.

## Invariants & binding decisions

- **The write surface is ONE unguarded primitive** — `upsertWords`, insert-or-patch on
  `UNIQUE(word, language)`, conflict set derived from each content's own keys (`patchOnConflict`:
  omitted = keep, carried = lands verbatim incl. explicit `null`). The repo checks **no domain
  invariants**: *which* writes are admissible is the gates' job (`ensureWordBuildable` before the
  seed; `buildWord`'s entry guard before the tracker flips), and the DB `CHECK` rejects a
  succeeded half-word at the engine. Don't add write wrappers, guards, or an update-only
  primitive back — the lifecycle writes are call sites, and a promote before a seed is legal (the
  INSERT arm creates the row).
- **Transactionality is not baked in** — every op (and each item of a batch) is its own statement;
  same-tx composition (seed + stages) is the use-case's job.
- `selectWord` is the one `Option`-returning read (a deliberate convenience exception to "DB verb ⇒
  raw rows"), kept beside `selectWords`.
- **Page size is a general capability, not policy** — `limit` is a bare pass-through (absent =
  whole match, unpaged), `page` is 1-based; the default/max page size lives at the API edge, never
  here. `q` is a single case-insensitive substring `ILIKE` over `word` + ready-branch gloss
  (`core_definition`, NULL on a building row ⇒ ready-only by construction) — one indexable path, no
  length-based branching.
- The counts file imports the one `wordSearchFilter` (+ `WordSearchQuery`) **from search** — that
  single authorship is what makes counts and the list agree by construction; keep the filter in
  exactly one file. An unfiltered call is just the empty filter — same live `COUNT … FILTER` scan.
- **`searchWords` runs two statements: the paged list + a standalone `count(*)`** for `total`
  (feeds `pageCount`). Deliberately **not** `count(*) OVER()` — the window count materializes the
  whole match and defeats the paged index walk; the separate count reuses the same filter/index.

## SQL/planner gotchas (EXPLAIN-verified — do not "simplify" these away)

- `orderBy` emits `created_at desc nulls last` to **match the index DDL**; plain `DESC` =
  `NULLS FIRST`, which mismatches the pathkeys and forces a full `Sort` + `Seq Scan`.
  `created_at` is NOT NULL, so `NULLS LAST` is semantically a no-op — it exists only to make the
  index usable. This is what keeps the `LIMIT/OFFSET` walk an index-ordered scan (no Sort node).
- **Paging is offset-based** (`LIMIT n OFFSET (page-1)*n`) for numbered-page navigation
  (1, 2, … last), a deliberate trade vs keyset: page boundaries can drift as new rows land at the
  top, but the numbered-page UX needs a total/last page keyset can't jump to. Keyset (seek) is the
  documented scaling alternative for deep infinite-scroll, and a deferred join (walk the narrow
  index for keys, fetch the heavy jsonb only for the page) is the lever if offset depth ever hurts
  — see `.claude/agent-patterns/postgres-capabilities.md` §16.

## Constraints & boundaries

- Return `WordRow` (`$inferSelect`), never a derived schema — `effect-schema` erases the jsonb
  `$type` (see `.claude/rules/drizzle-effect.md`). Error channel is `EffectDrizzleQueryError` only.
- May import `@kotodama/core/database`, `@kotodama/platform/*`, `effect`, `drizzle-orm` query
  helpers — never a bare `drizzle()`/driver, never the higher core layers
  (`@kotodama/core/{words,content,use-cases}`) or `apps/*` (Biome-enforced on `core/repositories/**`).
- Tests are DB-backed (Testcontainers — needs Docker); run the whole `core` suite:
  `bun run --filter '@kotodama/core' test`.
