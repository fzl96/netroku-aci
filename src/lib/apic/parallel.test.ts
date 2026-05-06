import { describe, it, expect } from 'bun:test'
import { runParallel } from './parallel'

describe('runParallel', () => {
  it('runs all items and returns results in order', async () => {
    const items = [1, 2, 3, 4, 5]
    const results = await runParallel(items, 2, async (n) => n * 2)
    expect(results).toEqual([2, 4, 6, 8, 10])
  })

  it('respects concurrency limit', async () => {
    let concurrent = 0
    let maxConcurrent = 0
    const items = [1, 2, 3, 4, 5, 6]
    await runParallel(items, 2, async () => {
      concurrent++
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await new Promise(r => setTimeout(r, 10))
      concurrent--
    })
    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  it('handles empty array', async () => {
    const results = await runParallel([], 5, async (x: number) => x)
    expect(results).toEqual([])
  })
})
