import { describe, expect, it } from '@effect/vitest'
import {
  enumAsyncJobStatus,
  enumWordBuildErrorType,
  enumWordBuildStage,
  type WordBuildErrorEntity,
} from '@kotodama/database'
import { stagesFromOutcome } from '../src/word-generator'

// stagesFromOutcome completes the stages a fail-fast build actually ran into the full six-stage
// picture — no engine, no container, so the never-ran → pending reset is proved on fixed inputs.
// Each expectation is the whole pipeline, read top to bottom like the stepper.
describe('stagesFromOutcome', () => {
  const { pending, succeeded, failed } = enumAsyncJobStatus
  const {
    fetch_source,
    enrich_etymology,
    enrich_tiers,
    enrich_authors,
    enrich_visuals,
    final_review,
  } = enumWordBuildStage
  const notFound: WordBuildErrorEntity = {
    type: enumWordBuildErrorType.not_found,
    message: 'no source found',
  }

  it('completes succeeded, failed, and never-ran passes into the pipeline picture, in order (AC-12)', () => {
    // fetch_source + enrich_etymology completed; enrich_visuals failed; the remaining three never ran.
    const stages = stagesFromOutcome([
      { stage: fetch_source, status: succeeded },
      { stage: enrich_etymology, status: succeeded },
      { stage: enrich_visuals, status: failed, error: notFound },
    ])

    expect(stages).toEqual([
      { stage: fetch_source, status: succeeded },
      { stage: enrich_etymology, status: succeeded },
      { stage: enrich_tiers, status: pending },
      { stage: enrich_authors, status: pending },
      { stage: enrich_visuals, status: failed, error: notFound },
      { stage: final_review, status: pending },
    ])
  })

  it('leaves every later pass pending when the first stage fails (AC-12)', () => {
    const stages = stagesFromOutcome([{ stage: fetch_source, status: failed, error: notFound }])

    expect(stages).toEqual([
      { stage: fetch_source, status: failed, error: notFound },
      { stage: enrich_etymology, status: pending },
      { stage: enrich_tiers, status: pending },
      { stage: enrich_authors, status: pending },
      { stage: enrich_visuals, status: pending },
      { stage: final_review, status: pending },
    ])
  })
})
