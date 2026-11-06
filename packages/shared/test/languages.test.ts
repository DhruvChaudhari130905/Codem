import { describe, expect, it } from 'vitest'
import { LANGUAGES, LANGUAGE_IDS, entryFile } from '../src/languages.js'

describe('languages', () => {
  it('lists the six v1 languages with Judge0 ids', () => {
    expect(LANGUAGE_IDS).toEqual(['python', 'javascript', 'typescript', 'java', 'cpp', 'go'])
    for (const id of LANGUAGE_IDS) expect(LANGUAGES[id].judge0Id).toBeGreaterThan(0)
  })
  it('names the entry file per language', () => {
    expect(entryFile('python')).toBe('main.py')
    expect(entryFile('java')).toBe('Main.java')
  })
})
