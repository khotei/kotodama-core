import { describe, expect, it } from '@effect/vitest'
import { enumLanguage } from '@kotodama/database'
import { Schema } from 'effect'
import { WordBuildMessageFromJson } from '../src/word-build-message.schema'

describe('WordBuildMessageFromJson', () => {
  it('round-trips a (language, word) message through the JSON-string body', () => {
    const message = { language: enumLanguage.en, word: 'lacuna' }
    const body = Schema.encodeSync(WordBuildMessageFromJson)(message)
    expect(typeof body).toBe('string')
    expect(Schema.decodeUnknownSync(WordBuildMessageFromJson)(body)).toEqual(message)
  })

  it('rejects a body missing a field or carrying an out-of-set language', () => {
    expect(() => Schema.decodeUnknownSync(WordBuildMessageFromJson)('{"language":"en"}')).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(WordBuildMessageFromJson)('{"language":"xx","word":"lacuna"}'),
    ).toThrow()
  })
})
