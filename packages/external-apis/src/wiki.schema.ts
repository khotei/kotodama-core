import { Schema } from 'effect'

/**
 * Only the grounding fields the engine consumes; the endpoint adds keys over time, so everything
 * past `type` is optional/nullable — a decode failure is a real schema break. `type` is
 * load-bearing: `"disambiguation"` is a chooser page the client maps to `Option.none`.
 */
export const WikiSummary = Schema.Struct({
  type: Schema.String,
  title: Schema.String,
  extract: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.NullOr(Schema.String)),
})
export type WikiSummary = typeof WikiSummary.Type

export const WikiSearchHit = Schema.Struct({
  id: Schema.Number,
  key: Schema.String,
  title: Schema.String,
  description: Schema.optionalKey(Schema.NullOr(Schema.String)),
  excerpt: Schema.optionalKey(Schema.NullOr(Schema.String)),
})
export type WikiSearchHit = typeof WikiSearchHit.Type

// An empty result is `{ pages: [] }`, not a 404.
export const WikiSearchResult = Schema.Struct({
  pages: Schema.Array(WikiSearchHit),
})
export type WikiSearchResult = typeof WikiSearchResult.Type
