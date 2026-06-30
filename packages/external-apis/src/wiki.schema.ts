import { Schema } from 'effect'

/**
 * The Wikipedia REST page-summary payload (`/api/rest_v1/page/summary/{title}`), decoded to only
 * the grounding fields the word engine consumes. The endpoint is partial and adds keys over time,
 * so every field past `type` is `optionalKey` (key may be absent) or `NullOr` — a decode failure
 * here is a real schema break, not a missing optional.
 *
 * `type` is load-bearing: `"standard"` is a real article; `"disambiguation"` is a chooser page with
 * no single grounding meaning. {@link WikiClient} maps the latter to `Option.none`, never an error.
 *
 * @see https://en.wikipedia.org/api/rest_v1/#/Page%20content/get_page_summary__title_
 */
export const WikiSummary = Schema.Struct({
  type: Schema.String,
  title: Schema.String,
  extract: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.NullOr(Schema.String)),
})
export type WikiSummary = typeof WikiSummary.Type

/**
 * One hit from the MediaWiki Core REST title search (`/w/rest.php/v1/search/title`). `description` /
 * `excerpt` are frequently null, so both are `NullOr`.
 */
export const WikiSearchHit = Schema.Struct({
  id: Schema.Number,
  key: Schema.String,
  title: Schema.String,
  description: Schema.optionalKey(Schema.NullOr(Schema.String)),
  excerpt: Schema.optionalKey(Schema.NullOr(Schema.String)),
})
export type WikiSearchHit = typeof WikiSearchHit.Type

/**
 * The search envelope: a `pages` array of {@link WikiSearchHit}. An empty result is `{ pages: [] }`,
 * not a 404 — so {@link WikiClient.searchTitle} yields `[]`, never an error.
 */
export const WikiSearchResult = Schema.Struct({
  pages: Schema.Array(WikiSearchHit),
})
export type WikiSearchResult = typeof WikiSearchResult.Type
