import { describe, expect, it } from '@effect/vitest'
import { Schema } from 'effect'
import { JobErrorView, StageProgress, WordStateModel } from '../src'
import { sampleWord } from './sample-word'

const roundtrip = (schema: Schema.Codec<unknown, unknown>, value: unknown) => {
  const decoded = Schema.decodeUnknownSync(schema)(value)
  expect(Schema.encodeSync(schema)(decoded)).toEqual(value)
}

describe('contract leaves validate against the DB enums', () => {
  it('StageProgress round-trips a stage+status, rejects a typo in either', () => {
    roundtrip(StageProgress, { stage: 'fetch_source', status: 'running' })
    expect(() =>
      Schema.decodeUnknownSync(StageProgress)({ stage: 'finalize', status: 'running' }),
    ).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(StageProgress)({ stage: 'fetch_source', status: 'cancelled' }),
    ).toThrow()
  })

  it('JobErrorView round-trips each typed failure, rejects an unknown type', () => {
    for (const type of ['not_found', 'timed_out', 'failed'] as const) {
      roundtrip(JobErrorView, { message: 'x', type })
    }
    expect(() => Schema.decodeUnknownSync(JobErrorView)({ message: 'x', type: 'boom' })).toThrow()
  })
})

describe('WordStateModel discriminated union', () => {
  it('round-trips running (ordered stage progress, no error)', () => {
    roundtrip(WordStateModel, {
      status: 'running',
      stages: [
        { stage: 'fetch_source', status: 'succeeded' },
        { stage: 'enrich_etymology', status: 'running' },
      ],
    })
  })

  it('round-trips failed (stages + a typed error)', () => {
    roundtrip(WordStateModel, {
      status: 'failed',
      stages: [{ stage: 'fetch_source', status: 'failed' }],
      error: { message: 'no source found', type: 'not_found' },
    })
  })

  it('round-trips succeeded (the rendered word)', () => {
    roundtrip(WordStateModel, { status: 'succeeded', word: sampleWord })
  })

  it('rejects an unknown status', () => {
    expect(() => Schema.decodeUnknownSync(WordStateModel)({ status: 'cancelled' })).toThrow()
  })
})
