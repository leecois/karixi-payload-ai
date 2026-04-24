/**
 * Minimal zero-dependency concurrency limiter.
 *
 * Problem: the existing bulk-runner calls payload.create() sequentially
 * per document. For large bulk jobs this serializes all I/O and also
 * makes rateLimit.maxConcurrentRequests / delayBetweenRequests (declared
 * in AIPluginConfig but never consumed) a no-op.
 *
 * This helper provides a p-limit-style primitive that honors the
 * configured limits without pulling a dependency.
 */

export type Limiter = {
  /** Schedule a task and wait for its result. Blocks when capacity is full. */
  <T>(task: () => Promise<T>): Promise<T>
  /** Number of tasks currently running */
  activeCount: () => number
  /** Number of tasks waiting for a slot */
  pendingCount: () => number
}

export function createLimiter(
  options: { concurrency?: number; delayBetweenMs?: number } = {},
): Limiter {
  const maxConcurrency = Math.max(1, options.concurrency ?? 1)
  const delayBetweenMs = Math.max(0, options.delayBetweenMs ?? 0)

  let active = 0
  const queue: Array<() => void> = []
  let lastDispatchAt = 0

  async function waitForDelay(): Promise<void> {
    if (delayBetweenMs <= 0) return
    // Loop because another task may dispatch during our sleep, resetting
    // lastDispatchAt; we must re-check rather than wake up early.
    // The first call (lastDispatchAt === 0) is allowed to dispatch immediately.
    while (lastDispatchAt !== 0) {
      const since = Date.now() - lastDispatchAt
      if (since >= delayBetweenMs) return
      await new Promise((r) => setTimeout(r, delayBetweenMs - since))
    }
  }

  async function acquire(): Promise<void> {
    await waitForDelay()

    if (active < maxConcurrency) {
      active++
      lastDispatchAt = Date.now()
      return
    }

    await new Promise<void>((resolve) => queue.push(resolve))
    // Re-check the delay gate after being woken up: the previous dispatch
    // may have been very recent, and we want every dispatch to respect
    // the minimum spacing regardless of whether the task queued or not.
    await waitForDelay()
    active++
    lastDispatchAt = Date.now()
  }

  function release(): void {
    active--
    const next = queue.shift()
    if (next) next()
  }

  const limiter = async <T>(task: () => Promise<T>): Promise<T> => {
    await acquire()
    try {
      return await task()
    } finally {
      release()
    }
  }

  return Object.assign(limiter, {
    activeCount: () => active,
    pendingCount: () => queue.length,
  }) as Limiter
}
