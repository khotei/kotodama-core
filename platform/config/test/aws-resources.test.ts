import { expect, it } from '@effect/vitest'
import { awsResourceList, awsResources } from '../src/aws-resources'

it('names the queue kotodama-jobs + bucket kotodama-images, keyed + listed (AC-1)', () => {
  expect(awsResources.jobsQueue).toEqual({ kind: 'sqs', name: 'kotodama-jobs' })
  expect(awsResources.imagesBucket).toEqual({ kind: 's3', name: 'kotodama-images' })
  expect(awsResourceList).toEqual([
    { kind: 'sqs', name: 'kotodama-jobs' },
    { kind: 's3', name: 'kotodama-images' },
  ])
})
