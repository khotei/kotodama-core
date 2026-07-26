# Postgres capabilities — the "reach for the primitive first" catalog

**On-demand reference** (pointer-loaded from `.claude/rules/drizzle-effect.md`; NOT auto-loaded). The
SQL sibling of `.claude/agent-patterns/effect-stdlib.md` and `type-fest.md`: the same repo reflex —
**before hand-writing a loop, a second query per row, a manual aggregate/dedup/collapse, or a running
total in application code, check whether Postgres does it in one construct.** Pushing a *data-shape*
concern into the engine is the deep-module move — the heavy `sql` hides behind a narrow typed interface
(a repo function or a `pgView`). The taste gate still applies: a native feature cargo-culted where a
plain query is clearer is its own smell.

> **Boundary (decide once, per feature):** put in the **DB** what is a *property of the data* — response
> shape (JSON assembly), aggregates, dedup, top-N, invariants (`CHECK`/`EXCLUDE`/`DOMAIN`/FK),
> atomicity (data-modifying CTE + `ON CONFLICT`). Keep in **code** what is *business policy* that changes
> for its own reasons — orchestration, auth, pricing, anything depending on external services / time /
> feature flags. Large PL/pgSQL sheets are a small, poorly-observable "second backend" — keep them
> reined in. (Reproduced from KB-33; it is the load-bearing framing.)

Domain examples use the kotodama-core schema: the **lifecycle `words` table** (F-CONT-006 — one row per
`(word, language)`, `status async_job_status NOT NULL`, content in `tiers`/`lexical`/… jsonb all
**nullable**, a `CHECK (status <> 'succeeded' OR <content non-null>)` enforcing "ready ⇒ complete"; a
building word is a `pending|running|failed` row, a ready one is `succeeded`, and per-stage build
progress rides inline on the **`words.stages`** jsonb (`{stage,status,error?}[]`), not a second table).

**Type-safety is the hard default:** always write through Drizzle's typed builder and `sql` with
**column references** (`sql\`… ${table.col} …\``), never a raw untyped string — so the row type infers
end-to-end and a schema change is a type error, not a runtime surprise. `sql` is a **first-class tool
here, not a fallback** — the vendored source is the reference:
`repos/drizzle/drizzle-orm/src/pg-core/effect/{select,db}.ts` (yieldable select, `$with`, `unionAll`,
`transaction`), `repos/drizzle/drizzle-orm/src/sql/functions/aggregate.ts`, and the built layer
`database/src/db.ts`. The DB dependency rides the Effect `R` channel via `drizzle-orm/effect-postgres`
(`.claude/rules/drizzle-effect.md`).

## Project decisions per primitive

- **§1 Window functions.** **Do NOT** reach for `count(*) OVER ()` to get a page total alongside a
  paged read — it materializes every match and defeats the paged scan's `LIMIT` (keyset) / index walk
  (offset) (§16); use a separate counts query/endpoint (kotodama-core's `searchWords` runs a standalone
  `count(*)` for its `total`).
- **§2 `FILTER`.** The kotodama-core `/counts` endpoint — `{total, pending, running, succeeded, failed}`
  in one scan, from the *same* `wordSearchFilter` the list uses (consistency is structural, not by
  convention).
- **§3 `LATERAL`.** For the Unified Word Query list we deliberately do **not** inline per-row stages
  (that is the word-page's job) — `LATERAL` is the tool the day we want "last activity per word" inline.
- **§4 jsonb read operators.** kotodama-core reads content in SQL (`tiers->'quick'->>'title'` gloss,
  `lexical->>'partOfSpeech'` pos), **but do NOT assemble the response shape in SQL when a TS view already
  owns the vocabulary** — building the status union in `jsonb_build_object` would fork the
  `enumAsyncJobStatus` vocabulary away from the single-word path. Read jsonb in SQL; shape the union in TS.
- **§5 `ON CONFLICT`.** kotodama-core's `upsertWord` is an insert-or-patch on `UNIQUE(word, language)` —
  `INSERT … ON CONFLICT DO UPDATE` with the conflict set derived from the content's own keys
  (`patchOnConflict`); admission (which states may be re-seeded) lives in the `ensureWordBuildable` gate,
  not a `WHERE` guard.
- **§7 `DISTINCT ON` — considered and rejected** for the Unified Word Query dedup (words-wins-over-jobs):
  it forces `ORDER BY (word, language, …)` first, which fights the feature's `ORDER BY (created_at DESC,
  word)` and breaks keyset early-stop. `UNION ALL` + a `NOT EXISTS` anti-join preserves per-branch
  ordering and is the better fit there (§16).
- **§11 `VIEW` / materialized view.** **kotodama-core no longer uses a `pgView` here (F-CONT-006,
  supersedes the F-PLAT-005 design).** The list/counts *did* read a `word_summaries` pgView unioning
  `words ∪ async_word_jobs`; F-CONT-006 merged `status` onto the `words` row (nullable content + CHECK),
  so a building word IS a `words` row and `searchWords`/`selectWordCounts` read the **table** directly —
  the pgView was deleted. A **materialized** view's staleness makes it **wrong** for a "just-added word
  must appear immediately" list (same reason a counts cache was rejected).
- **§12 FTS + `pg_trgm`.** The documented *scaling* answer for the Unified Word Query search — MVP ships
  `ILIKE`, then add `GIN(lower(tiers->'quick'->>'title') gin_trgm_ops)` (expression index) or a generated
  `gloss` column.
- **§16 Paging — `searchWords` uses OFFSET, not keyset (supersedes the F-CONT-005 keyset design).** The
  search serves a **numbered-page UI** (1, 2, … *last*), which needs a total and the ability to jump to
  an arbitrary/last page — neither of which a forward-only cursor can do. So it pages with `LIMIT/OFFSET`
  over the `words_language_created_at_word_idx` btree (the `DESC NULLS LAST` DDL matches the ORDER BY, so
  the sort is index-provided — no `Sort` node) and returns `total` from a **separate `count(*)`** (never
  `count(*) OVER()` — see §1). Accepted trade: offset page boundaries drift as new rows land at the top,
  and deep pages re-scan. **Levers if that ever hurts:** switch back to keyset for infinite-scroll, or a
  **deferred join** — walk the narrow index for just the page's ids, then join back to fetch the heavy
  jsonb for the `n` rows on the page, so the discarded offset rows never read their wide columns.

**Version note:** the repo targets stable Postgres — treat any **[PG19]** feature as *not yet available*.

## See also

- `.claude/rules/drizzle-effect.md` — the mandated Drizzle⇄Effect pattern (the *how*).
- `.claude/agent-patterns/effect-stdlib.md`, `type-fest.md` — the sibling "reach for the primitive" catalogs.
- `repos/drizzle/` — vendored source; the authority for exact `sql`/`pgView`/`effect-postgres` shapes.
