import { describe, expect, it } from 'vitest'
import { createLimiter } from './src/orchestrate/concurrency.js'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe('createLimiter', () => {
  it('serializes execution when concurrency=1 (default)', async () => {
    const limit = createLimiter()
    const order: string[] = []
    await Promise.all([
      limit(async () => {
        order.push('a-start')
        await sleep(20)
        order.push('a-end')
      }),
      limit(async () => {
        order.push('b-start')
        await sleep(10)
        order.push('b-end')
      }),
    ])
    // With concurrency=1 the second must not start until the first ends
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end'])
  })

  it('allows parallel execution up to the concurrency cap', async () => {
    const limit = createLimiter({ concurrency: 3 })
    let peak = 0
    let active = 0
    const task = async () => {
      active++
      peak = Math.max(peak, active)
      await sleep(30)
      active--
    }
    await Promise.all(Array.from({ length: 10 }, () => limit(task)))
    expect(peak).toBe(3)
  })

  it('enforces delayBetweenMs between dispatches', async () => {
    const limit = createLimiter({ concurrency: 1, delayBetweenMs: 40 })
    const stamps: number[] = []
    const start = Date.now()
    await Promise.all(
      Array.from({ length: 3 }, () =>
        limit(async () => {
          stamps.push(Date.now() - start)
        }),
      ),
    )
    // With concurrency=1 + 40ms between dispatches, the three dispatches
    // happen at ~0, ~40, ~80 (allow slop for timer jitter)
    expect(stamps[1] - stamps[0]).toBeGreaterThanOrEqual(35)
    expect(stamps[2] - stamps[1]).toBeGreaterThanOrEqual(35)
  })

  it('releases slots when a task throws', async () => {
    const limit = createLimiter({ concurrency: 1 })
    await expect(
      limit(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    // Next task still runs
    const result = await limit(async () => 42)
    expect(result).toBe(42)
  })

  it('reports activeCount and pendingCount', async () => {
    const limit = createLimiter({ concurrency: 1 })
    expect(limit.activeCount()).toBe(0)
    expect(limit.pendingCount()).toBe(0)
    const longTask = limit(async () => sleep(50))
    // Kick off pending tasks
    const pending = [limit(async () => sleep(5)), limit(async () => sleep(5))]
    await sleep(5)
    expect(limit.activeCount()).toBe(1)
    expect(limit.pendingCount()).toBeGreaterThanOrEqual(1)
    await Promise.all([longTask, ...pending])
    expect(limit.activeCount()).toBe(0)
    expect(limit.pendingCount()).toBe(0)
  })

  it('clamps concurrency below 1 to 1', async () => {
    const limit = createLimiter({ concurrency: 0 })
    const order: number[] = []
    await Promise.all([
      limit(async () => {
        await sleep(20)
        order.push(1)
      }),
      limit(async () => {
        order.push(2)
      }),
    ])
    expect(order).toEqual([1, 2])
  })
})
