import { Effect, Schema } from 'effect'

// Offset-paging vocabulary shared across resource groups. `pageQuery` self-defaults `page`/`limit`
// at decode time (the key stays optional on the wire, required on the decoded `Type`), so a handler
// reads both as plain numbers with no `?? default` fallback. `Paginated` is the response envelope —
// only the item schema varies per entity.

export const PaginationView = Schema.Struct({
  page: Schema.Int,
  limit: Schema.Int,
  total: Schema.Int,
  pageCount: Schema.Int,
})
export type PaginationView = typeof PaginationView.Type

export function Paginated<S extends Schema.Top>(items: S) {
  return Schema.Struct({
    items: Schema.Array(items),
    pagination: PaginationView,
  })
}

/**
 * Build a {@link Paginated} value from a repo's `{ total }` page-read plus the request `page`/`limit`
 * — the sole author of `pageCount`, so a handler never re-derives `Math.ceil(total / limit)`.
 */
export function paginate<A>(
  items: ReadonlyArray<A>,
  { page, limit, total }: { readonly page: number; readonly limit: number; readonly total: number },
) {
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pageCount: Math.ceil(total / limit),
    },
  }
}

export function pageQuery(options: { defaultLimit: number; maxLimit: number }) {
  return {
    page: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed(1)),
    ),
    limit: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(1),
      Schema.isLessThanOrEqualTo(options.maxLimit),
    ).pipe(Schema.withDecodingDefaultKey(Effect.succeed(options.defaultLimit))),
  }
}
