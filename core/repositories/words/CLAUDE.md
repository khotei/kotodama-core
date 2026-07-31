# repositories/words — `@kotodama/core/repositories`

Bare persistence functions over the `words` lifecycle table — **no `WordsRepo` service** (owns no
resource, never test-swapped; the swap point is `DB` — effect-conventions.md "Service vs plain
function").

## Invariants & binding decisions

- **The write surface is ONE unguarded primitive** (`upsertWords`, insert-or-patch on
  `UNIQUE(word, language)`). It checks **no domain invariants** — admissibility is the gates' job
  (`ensureWordBuildable`, `buildWord`'s entry guard) plus the DB `CHECK`. Don't add write
  wrappers/guards or an update-only primitive: a promote before a seed is legal (the INSERT arm
  creates the row).
- **Transactionality is not baked in** — every op is its own statement; same-tx composition (seed +
  stages) is the use-case's job.
- **Page size is capability, not policy** — `limit` is a bare pass-through (absent = unpaged), `page`
  is 1-based; the default/max lives at the API edge. `q` is one `ILIKE` over `word` + the ready-branch
  gloss (`core_definition`, NULL on a building row ⇒ ready-only by construction) — one indexable path.
- **`wordSearchFilter` lives in exactly one file** (search), imported by counts — that single
  authorship is what makes counts and the list agree by construction.
- **The paged `searchWords` = two statements** (paged list + a standalone `count(*)`), deliberately
  not `count(*) OVER()` — the window count materializes the whole match and defeats the paged index
  walk. The **unpaged** branch (`limit` absent) skips the count entirely: the full list already *is*
  the total.

## SQL/planner gotchas (EXPLAIN-verified — do not "simplify" away)

- `orderBy` emits `created_at desc nulls last` to **match the index DDL** (`created_at` is NOT NULL,
  so `NULLS LAST` is a semantic no-op) — plain `DESC` = `NULLS FIRST` mismatches the pathkeys and
  forces a full `Sort` + `Seq Scan`.
- **Paging is offset-based** for numbered-page nav (needs a total/last page keyset can't jump to);
  boundaries can drift as rows land at the top. Deep-scroll levers if that ever hurts: keyset (for
  infinite-scroll) or a deferred join (walk the narrow index for the page's ids, then join back for
  the wide jsonb).

## Constraints

- Return `WordRow` (`$inferSelect`), never a derived schema — `effect-schema` erases the jsonb
  `$type` (drizzle-effect.md).
