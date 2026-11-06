import { describe, expect, it } from 'vitest'
import { outputsMatch } from '../src/jobs.js'

describe('outputsMatch', () => {
  it('ignores trailing whitespace and trailing newlines', () => {
    expect(outputsMatch('5\n\n', '5')).toBe(true)
    expect(outputsMatch('1 2 \r\n3\t\n', '1 2\n3')).toBe(true)
  })
  it('is otherwise exact', () => {
    expect(outputsMatch(' 5', '5')).toBe(false)
    expect(outputsMatch('1\n\n2', '1\n2')).toBe(false)
  })
})
