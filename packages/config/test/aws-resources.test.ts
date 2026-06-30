import { expect, it } from '@effect/vitest'
import { awsResourceList, awsResources } from '../src/aws-resources'

it('names the queue lexiai-jobs + bucket lexiai-images, keyed + listed (AC-1)', () => {
  expect(awsResources.jobsQueue).toEqual({ kind: 'sqs', name: 'lexiai-jobs' })
  expect(awsResources.imagesBucket).toEqual({ kind: 's3', name: 'lexiai-images' })
  expect(awsResourceList).toEqual([
    { kind: 'sqs', name: 'lexiai-jobs' },
    { kind: 's3', name: 'lexiai-images' },
  ])
})
