# Postgres capabilities — the "reach for the primitive first" catalog

**On-demand reference** (pointer-loaded from `.claude/rules/drizzle-effect.md`; NOT auto-loaded). This is
the SQL sibling of `.claude/agent-patterns/effect-stdlib.md` and `.claude/agent-patterns/type-fest.md`:
the same repo reflex — **before hand-writing a loop, a second query per row, a manual
aggregate/dedup/collapse, or a running total in application code, check whether Postgres does it in one
construct.** Pushing a *data-shape* concern into the engine is the deep-module move: the heavy
`sql` hides behind a narrow typed interface (a repo function or a `pgView`), and a whole class of
app-side loops disappears.

Not a feature encyclopedia — a **recognition map**: left = the symptom you notice while coding, right =
the primitive that dissolves it. Scan the index; dive into the section. The taste gate still applies —
name the complexity a feature removes *here* before grabbing it; a native feature cargo-culted where a
plain query is clearer is its own smell.

> **Boundary (decide once, per feature):** put in the **DB** what is a *property of the data* — response
> shape (JSON assembly), aggregates, dedup, top-N, invariants (`CHECK`/`EXCLUDE`/`DOMAIN`/FK),
> atomicity (data-modifying CTE + `ON CONFLICT`). Keep in **code** what is *business policy* that changes
> for its own reasons — orchestration, auth, pricing, anything depending on external services / time /
> feature flags. Large PL/pgSQL sheets are a small, poorly-observable "second backend" — keep them
> reined in. (Reproduced from KB-33; it is the load-bearing framing.)

## Trigger index

| You notice in code / the task | Reach for | § |
|---|---|---|
| Pulling rows to compute a running total / rank / delta-vs-previous in TS | Window functions | 1 |
| Several `COUNT`s with different `WHERE` for one stats card | `FILTER` | 2 |
| N+1: a separate query per row for its top-N related | `LATERAL` | 3 |
| Assembling a nested JSON API payload by hand from several selects | `jsonb_build_object` / `jsonb_agg` | 4 |
| `SELECT exists` → else `INSERT`; races produce dupes | `ON CONFLICT` (**[PG19]** `DO SELECT`) | 5 |
| Preventing overlapping ranges via `FOR UPDATE` + in-code overlap check | `EXCLUDE` constraint | 6 |
| Sorting in code to take the latest row per group | `DISTINCT ON` | 7 |
| Computing median / p95 in the app | ordered-set aggregates (`percentile_cont`) | 8 |
| A field always derived from others, occasionally out of sync | Generated column | 9 |
| Walking a tree/graph with a query per level | Recursive CTE | 10 |
| One heavy query copy-pasted in several places | `VIEW` / materialized view | 11 |
| `LIKE '%…%'` is slow / need fuzzy / autocomplete | FTS + `pg_trgm` | 12 |
| Validating the same format/range differently in each service | `DOMAIN` / `CHECK` | 13 |
| Writing several related rows as separate statements, fearing atomicity | Data-modifying CTE | 14 |
| Subtotals across several dimensions as separate queries | `GROUPING SETS` / `ROLLUP` | 15 |
| Paging a list (numbered pages vs infinite scroll) | Offset vs keyset (seek) pagination | 16 |

Domain examples use the lexi-ai schema: the **lifecycle `words` table** (F-CONT-006 — one row per
`(word, language)`, `status async_job_status NOT NULL`, content in `tiers`/`lexical`/… jsonb all
**nullable**, a `CHECK (status <> 'succeeded' OR <content non-null>)` enforcing "ready ⇒ complete"; a
building word is a `pending|running|failed` row, a ready one is `succeeded`) and **`async_word_jobs`** (one
row per `(word, language, stage)`; `status ∈ pending|running|succeeded|failed`). Spaced-repetition examples
(`reviews`, `user_words`) are illustrative — those tables don't exist yet.

## How each maps to Drizzle (`drizzle-orm/effect-postgres`)

| Capability | In Drizzle |
|---|---|
| CRUD, join, `groupBy`, set-ops (`unionAll`) | native |
| CTE | `$with()` / `.with()`; data-modifying CTE via `sql` |
| `ON CONFLICT DO UPDATE/NOTHING` | native (`.onConflictDoUpdate`); `DO SELECT` **[PG19]** via `sql` |
| Generated columns, identity, sequences | native (`.generatedAlwaysAs(sql\`…\`)`) |
| Views / materialized views | native (`pgView` / `pgMaterializedView`) |
| Custom types (`tsvector`, range, domain) | `customType<…>()` |
| Window fns, `FILTER`, `LATERAL`, `DISTINCT ON`, JSON assembly, FTS, `EXCLUDE` | `sql` template (type-safe by column references) |

**Type-safety is the hard default:** always write through Drizzle's typed builder and `sql` with
**column references** (`sql\`… ${table.col} …\``), never a raw untyped string — so the row type infers
end-to-end and a schema change is a type error, not a runtime surprise. `sql` is a **first-class tool
here, not a fallback** — the vendored source is the reference:
`repos/drizzle/drizzle-orm/src/pg-core/effect/{select,db}.ts` (yieldable select, `$with`, `unionAll`,
`transaction`), `repos/drizzle/drizzle-orm/src/sql/functions/aggregate.ts`, and the built layer
`database/src/db.ts`. The DB dependency rides the Effect `R` channel via
`drizzle-orm/effect-postgres` (`.claude/rules/drizzle-effect.md`).

---

## 1. Running total / rank / delta → window functions

Symptom: rows pulled to compute a running total, place numbers, or a row-vs-previous diff in TS.
Family: `ROW_NUMBER`/`RANK`/`DENSE_RANK`, `LAG`/`LEAD`, `FIRST_VALUE`/`LAST_VALUE`, `NTILE`, plus any
aggregate as a window; moving average via a frame (`ROWS BETWEEN 6 PRECEDING AND CURRENT ROW`).

```sql
SELECT day, learned,
  SUM(learned) OVER (ORDER BY day)                 AS total_so_far,
  learned - LAG(learned,1,0) OVER (ORDER BY day)   AS delta_vs_prev,
  RANK() OVER (ORDER BY learned DESC)              AS busiest_day_rank
FROM daily_stats WHERE user_id = $1;
```

One pass next to the data; removes a class of TS loops. **Do NOT** reach for `count(*) OVER ()` to
get a page total alongside a paged read — it materializes every match and defeats the paged scan's
`LIMIT` (keyset) / index walk (offset) (§16); use a separate counts query/endpoint (lexi-ai's
`searchWords` runs a standalone `count(*)` for its `total`). Docs: <https://www.postgresql.org/docs/current/tutorial-window.html>.

## 2. Several conditional counters at once → `FILTER`

Symptom: 3–4 separate `COUNT(...)`/`AVG(...)` with different `WHERE` for one stats card. **This is the
lexi-ai `/counts` endpoint** — `{total, pending, running, succeeded, failed}` in one scan of one query,
from the *same* `wordSearchFilter` the list uses (consistency is structural, not by convention). An
unfiltered call is just the empty filter over the whole language — same scan, no separate counter path.

```sql
SELECT
  count(*)                                          AS total,
  count(*) FILTER (WHERE status = 'pending')        AS pending,
  count(*) FILTER (WHERE status = 'running')        AS running,
  count(*) FILTER (WHERE status = 'succeeded')      AS succeeded,
  count(*) FILTER (WHERE status = 'failed')         AS failed
FROM words WHERE language = $1;
```

Drizzle: `sql` (`count(*) filter (where …)`). Docs (aggregate `FILTER`):
<https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-AGGREGATES>.

## 3. Top-N related per row → `LATERAL`

Symptom: the classic N+1 — a query per word for its last N reviews.

```sql
SELECT w.word, r.grade, r.reviewed_at
FROM words w
CROSS JOIN LATERAL (
  SELECT grade, reviewed_at FROM reviews
  WHERE reviews.word_id = w.id ORDER BY reviewed_at DESC LIMIT 3
) r;
```

`LEFT JOIN LATERAL (…) ON true` keeps rows with no matches. For the Unified Word Query list we
deliberately do **not** inline per-row stages (that is the word-page's job) — `LATERAL` is the tool the
day we want "last activity per word" inline. Docs:
<https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-LATERAL>.

## 4. Nested JSON payload → `jsonb_build_object` / `jsonb_agg`

Symptom: several selects hand-stitched into a nested object (and an N+1 with it). **Read** operators
(`->`, `->>`, `@>`, `jsonb_path_query`, `@@`) are how lexi-ai reads content — e.g. `tiers->'quick'->>'title'`
(gloss), `lexical->>'partOfSpeech'` (pos). **But do NOT assemble the response shape in SQL when a TS
view already owns the vocabulary** — building the status union in `jsonb_build_object` would fork the
`enumAsyncJobStatus` vocabulary away from the single-word `WordStateView`/`collapseWordState` path. Read
jsonb in SQL; shape the union in TS. Docs: <https://www.postgresql.org/docs/current/functions-json.html>.

## 5. Get-or-create without races → `ON CONFLICT` / **[PG19]** `DO SELECT`

lexi-ai's `upsertWord` is an insert-or-patch on `UNIQUE(word, language)` — `INSERT … ON CONFLICT DO
UPDATE` with the conflict set derived from the content's own keys (`patchOnConflict`); admission
(which states may be re-seeded) lives in the `ensureWordBuildable` gate, not a `WHERE` guard. The **[PG19]** `DO SELECT` gives
true atomic get-or-create (return the existing row,
optionally `FOR UPDATE`, no dummy write) — CYBERTEC benchmarks it ~4× faster than the `DO UPDATE SET
col = EXCLUDED.col` no-op workaround. Not usable until PG19 is GA (~Sep–Oct 2026); today the no-op-update
or a CTE+`SELECT` stands in.

```sql
-- [PG19] atomic get-or-create — return existing without an update
INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO SELECT RETURNING id, name;
```

Docs: <https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT> ·
[CYBERTEC — DO SELECT](https://www.cybertec-postgresql.com/en/insert-on-conflict-do-select-a-new-feature-in-postgresql-v19/).

## 6. Non-overlapping ranges as an invariant → `EXCLUDE`

Symptom: `SELECT … FOR UPDATE` + in-code overlap check to prevent double-booking. An `EXCLUDE` constraint
(needs `btree_gist`) makes overlap unrepresentable — every writer is covered by the schema, races gone.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE bookings (room_id int, during tstzrange,
  EXCLUDE USING gist (room_id WITH =, during WITH &&));   -- && = overlaps
```

Docs: <https://www.postgresql.org/docs/current/btree-gist.html> ·
<https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-EXCLUSION>.

## 7. Latest row per group → `DISTINCT ON`

Symptom: sorting then taking the first row of each group in code. Rule: the `DISTINCT ON (…)` list must be
the left prefix of `ORDER BY`.

```sql
SELECT DISTINCT ON (word_id) word_id, grade, reviewed_at
FROM reviews ORDER BY word_id, reviewed_at DESC;
```

**Considered and rejected** for the Unified Word Query dedup (words-wins-over-jobs): `DISTINCT ON`
forces `ORDER BY (word, language, …)` first, which fights the feature's `ORDER BY (created_at DESC, word)`
and breaks keyset early-stop. `UNION ALL` + a `NOT EXISTS` anti-join preserves per-branch ordering and is
the better fit there (§16). Docs: <https://www.postgresql.org/docs/current/sql-select.html#SQL-DISTINCT>.

## 8. Median / percentiles → ordered-set aggregates

```sql
SELECT topic,
  percentile_cont(0.5)  WITHIN GROUP (ORDER BY latency_ms) AS p50,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95,
  mode() WITHIN GROUP (ORDER BY grade)                     AS most_common_grade
FROM reviews GROUP BY topic;
```

Docs: <https://www.postgresql.org/docs/current/functions-aggregate.html#FUNCTIONS-ORDEREDSET-TABLE>.

## 9. Field always derived from others → generated column

Symptom: a column recomputed from others that occasionally drifts. Standard host for a materialized
`tsvector`, a normalized/search key, or a score. Pairs with §12 (index a jsonb-extracted `gloss` as a
`STORED` column instead of an expression index when the search field becomes first-class).

```sql
ALTER TABLE words ADD COLUMN gloss text
  GENERATED ALWAYS AS (tiers->'quick'->>'title') STORED;   -- then GIN(gloss gin_trgm_ops)
```

Drizzle: `.generatedAlwaysAs(sql\`…\`)`. Trade-off vs an expression index: a column costs write/space but
is clearer and typeable; an expression index is lighter. Docs:
<https://www.postgresql.org/docs/current/ddl-generated-columns.html>.

## 10. Trees & graphs → recursive CTE

```sql
WITH RECURSIVE tree AS (
  SELECT id, parent_id, title, title::text AS path FROM topics WHERE parent_id IS NULL
  UNION ALL
  SELECT t.id, t.parent_id, t.title, tree.path || ' / ' || t.title
  FROM topics t JOIN tree ON t.parent_id = tree.id)
SELECT * FROM tree ORDER BY path;
```

**[PG19]** adds declarative SQL/PGQ (`GRAPH_TABLE`) for graph queries without a separate graph DB. Docs:
<https://www.postgresql.org/docs/current/queries-with.html>.

## 11. One heavy query in five places → `VIEW` / materialized view

**The deep-module play when one heavy query is copy-pasted.** Define a combined query once as a
**`pgView`**; the repo then reads a narrow typed table, not a scary UNION, and every reader agrees
structurally.

```sql
CREATE VIEW some_summary AS …;   -- Drizzle: pgView('some_summary').as((qb) => …)
```

> **lexi-ai no longer uses a `pgView` here (F-CONT-006, supersedes the F-PLAT-005 design).** The Unified
> Word Query list/counts *did* read a `word_summaries` pgView that unioned `words ∪ async_word_jobs` (a
> `jobs_agg` CTE + `UNION ALL` + `NOT EXISTS` dedup + `status` `CASE`) — needed only because `words` was
> then pristine (a row existed ⇔ ready), so building words lived solely in `async_word_jobs`. F-CONT-006
> merged `status` onto the `words` row (nullable content + CHECK), so a building word IS a `words` row and
> `searchWords`/`selectWordCounts` read the **table** directly. The pgView was deleted. The
> `VIEW`/materialized-view capability below still stands as a general technique — it just isn't the shape
> this domain landed on.

**Plain `pgView`, not materialized:** a plain view is inlined by the planner (predicate pushdown of the
`language` filter and the keyset predicate into both `UNION ALL` branches → each uses its index, `LIMIT`
stops early — verify with `EXPLAIN`), and it is **always fresh**. A **materialized** view is the tool for
an expensive dashboard aggregate refreshed on a schedule (`REFRESH … CONCURRENTLY`) — but its staleness is
exactly why it is **wrong** for a "just-added word must appear immediately" list (same reason a counts
cache was rejected). Docs: <https://www.postgresql.org/docs/current/sql-createview.html> ·
<https://www.postgresql.org/docs/current/rules-materializedviews.html>.

## 12. Slow `LIKE '%…%'` / typos / autocomplete → FTS + `pg_trgm`

`LIKE '%x%'` cannot use a b-tree index. Two indexable tools, **different jobs**:

- **`pg_trgm` (GIN, `gin_trgm_ops`)** — substring + fuzzy (`%`, `similarity()`, `word_similarity()`).
  The right pick for a **short-term search / ⌘K autocomplete over `words.term` and `gloss`**, and for
  "did you mean…". This is the documented *scaling* answer for the Unified Word Query search — MVP ships
  `ILIKE`, then add `GIN(lower(tiers->'quick'->>'title') gin_trgm_ops)` (expression index) or a generated
  `gloss` column (§9). It does **not** stem — it is character-trigram matching, not linguistic.
- **FTS (`tsvector`/`tsquery`, GIN)** — stemming, word forms, `ts_rank`. For **prose/definitions**, not a
  short term; it does **not** tolerate typos (a missing letter ⇒ no match). Standard pattern: FTS for
  primary results, trigram as the typo fallback when FTS returns nothing.

```sql
-- fuzzy term / autocomplete (pg_trgm)
SELECT term FROM words WHERE term % $1 ORDER BY similarity(term,$1) DESC LIMIT 5;
```

Docs: <https://www.postgresql.org/docs/current/pgtrgm.html> ·
<https://www.postgresql.org/docs/current/textsearch.html>.

## 13. Format/range validation everywhere → `DOMAIN` / `CHECK`

```sql
CREATE DOMAIN email AS citext CHECK (VALUE ~ '^[^@]+@[^@]+\.[^@]+$');
ALTER TABLE user_words ADD CONSTRAINT ef_range CHECK (ef BETWEEN 1.3 AND 2.5);
```

One invariant, in the schema, for all writers. Docs:
<https://www.postgresql.org/docs/current/sql-createdomain.html> ·
<https://www.postgresql.org/docs/current/ddl-constraints.html>.

## 14. Several related writes atomically → data-modifying CTE

```sql
WITH moved AS (DELETE FROM active_words WHERE id = $1 RETURNING *)
INSERT INTO archived_words SELECT * FROM moved RETURNING id;
```

All sub-CTEs see one snapshot — you can't read in the same command what another CTE just inserted. Drizzle:
via `sql`. (The build flow's cross-table atomicity uses `db.transaction` — `repos/drizzle/.../effect/db.ts`.)
Docs: <https://www.postgresql.org/docs/current/queries-with.html#QUERIES-WITH-MODIFYING>.

## 15. Subtotals across dimensions → `GROUPING SETS` / `ROLLUP`

```sql
SELECT topic, level, COUNT(*) FROM words
GROUP BY GROUPING SETS ((topic, level), (topic), (level), ());
```

Docs: <https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-GROUPING-SETS>.

## 16. Paging → offset (numbered pages) vs keyset (seek)

`OFFSET n` re-scans and discards n rows — cost grows with the page. **Keyset** carries the last row's sort
key as an opaque cursor and seeks past it, so page N costs the same as page 1; the seek predicate for
`ORDER BY (created_at DESC, word ASC)` is `or(lt(created_at, $c), and(eq(created_at, $c), gt(word, $w)))`
with `LIMIT n` — `(created_at, word)` is a unique sort key (`word` is unique per language-scoped branch),
so no surrogate tiebreaker is needed.

> **lexi-ai's `searchWords` uses OFFSET, not keyset (supersedes the F-CONT-005 keyset design).** The
> Unified Word Query search serves a **numbered-page UI** (1, 2, … *last*), which needs a total and the
> ability to jump to an arbitrary/last page — neither of which a forward-only cursor can do. So it pages
> with `LIMIT/OFFSET` over the `words_language_created_at_word_idx` btree (the `DESC NULLS LAST` DDL
> matches the ORDER BY, so the sort is index-provided — no `Sort` node) and returns `total` from a
> **separate `count(*)`** (never `count(*) OVER()` — see §1). The accepted trade: offset page boundaries
> drift as new rows land at the top, and deep pages re-scan. **Levers if that ever hurts:** switch back to
> keyset for infinite-scroll, or a **deferred join** — walk the narrow index for just the page's ids
> (`… ORDER BY … LIMIT n OFFSET m` selecting only the key), then join back to fetch the heavy jsonb for the
> `n` rows on the page, so the discarded offset rows never read their wide columns.

Refs: [Use-The-Index-Luke — No Offset](https://use-the-index-luke.com/no-offset) ·
[Drizzle cursor pagination](https://orm.drizzle.team/docs/guides/cursor-based-pagination).

---

## Version notes

- **Stable in PG 14–18** — everything except items explicitly tagged **[PG19]**. The repo targets stable
  Postgres; treat **[PG19]** as *not yet available* (Beta 1 = 4 Jun 2026, GA ~Sep–Oct 2026).
- **[PG19] highlights** (verify before relying — [release notes](https://www.postgresql.org/docs/19/release-19.html)):
  `ON CONFLICT DO SELECT` (§5, the most applied one), SQL/PGQ graph queries (§10), `FOR PORTION OF`
  (temporal `UPDATE`/`DELETE`), `COPY … TO (FORMAT json)`. Operational defaults changed: JIT **off** by
  default, TOAST compression default `lz4`, parallel autovacuum, `REPACK CONCURRENTLY`.

## See also

- `.claude/rules/drizzle-effect.md` — the mandated Drizzle⇄Effect pattern (the *how*).
- `.claude/agent-patterns/effect-stdlib.md`, `type-fest.md` — the sibling "reach for the primitive" catalogs.
- `repos/drizzle/` — vendored source; the authority for exact `sql`/`pgView`/`effect-postgres` shapes.
