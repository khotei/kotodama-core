import { WordEntity } from '@kotodama/database'
import { Struct } from 'effect'

/**
 * The entity minus envelope/identity/status/provenance — what the pipeline produces. Derived from
 * {@link WordEntity} (never re-declared) so it can't drift from the row; authored in core, not
 * `database/`, because a selection computed over the entity is a domain shape, not storage
 * vocabulary.
 */
export const WordContent = WordEntity.mapFields(
  Struct.omit([
    'id',
    'word',
    'language',
    'stages',
    'sourceVersions',
    'status',
    'createdAt',
    'updatedAt',
  ]),
)
export type WordContent = typeof WordContent.Type
