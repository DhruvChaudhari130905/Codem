import { describe, expect, it } from 'vitest'
import { clampLimits } from '../src/limits.js'

describe('clampLimits', () => {
  it('fills defaults with wall time = 2x cpu', () => {
    expect(clampLimits({})).toEqual({ cpuSec: 10, wallSec: 20, memMb: 512 })
  })

  it('clamps values above the maximums', () => {
    expect(clampLimits({ cpuSec: 999, memMb: 99999 })).toEqual({ cpuSec: 60, wallSec: 120, memMb: 8192 })
  })
})
