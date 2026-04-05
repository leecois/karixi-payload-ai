/** Stagehand browser automation client with Playwright fallback */

export type StagehandConfig = {
  baseUrl?: string
  headless?: boolean
  viewport?: { width: number; height: number }
  timeout?: number
}

export type StagehandInstance = {
  goto(path: string): Promise<void>
  screenshot(): Promise<Buffer>
  act(instruction: string): Promise<void>
  extract<T = unknown>(instruction: string): Promise<T>
  observe(instruction: string): Promise<unknown>
  close(): Promise<void>
}

export async function isStagehandAvailable(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    await (Function('return import("@anthropic-ai/stagehand")')() as Promise<unknown>)
    return true
  } catch {
    return false
  }
}

export async function createStagehandClient(config?: StagehandConfig): Promise<StagehandInstance> {
  const {
    baseUrl = 'http://localhost:3000',
    headless = true,
    viewport = { width: 1440, height: 900 },
    timeout = 30000,
  } = config ?? {}

  // Try Stagehand first (optional peer dep — dynamic import, no static types)
  try {
    // Dynamic import via Function to avoid TS module resolution errors
    const stagehandMod = await (Function('return import("@anthropic-ai/stagehand")')() as Promise<
      Record<string, unknown>
    >)
    const StagehandClass = stagehandMod.Stagehand as new (
      opts: Record<string, unknown>,
    ) => {
      init(): Promise<void>
      page: {
        setViewportSize(v: { width: number; height: number }): void
        setDefaultTimeout(t: number): void
        goto(url: string): Promise<unknown>
        screenshot(opts?: Record<string, unknown>): Promise<Uint8Array>
      }
      act(opts: Record<string, unknown>): Promise<unknown>
      extract(opts: Record<string, unknown>): Promise<unknown>
      observe(opts: Record<string, unknown>): Promise<unknown>
      close(): Promise<void>
    }

    const stagehand = new StagehandClass({ env: 'LOCAL', headless, verbose: 0 })
    await stagehand.init()
    const page = stagehand.page
    page.setViewportSize(viewport)
    page.setDefaultTimeout(timeout)

    return {
      async goto(path: string) {
        const url = path.startsWith('http') ? path : `${baseUrl}${path}`
        await page.goto(url)
      },
      async screenshot() {
        const buf = await page.screenshot({ type: 'png' })
        return Buffer.from(buf)
      },
      async act(instruction: string) {
        await stagehand.act({ action: instruction })
      },
      async extract<T = unknown>(instruction: string): Promise<T> {
        return stagehand.extract({ instruction }) as Promise<T>
      },
      async observe(instruction: string) {
        return stagehand.observe({ instruction })
      },
      async close() {
        await stagehand.close()
      },
    }
  } catch {
    // Stagehand not available — try Playwright fallback
  }

  // Playwright fallback (optional peer dep — dynamic import)
  try {
    const playwrightMod = await (Function('return import("playwright")')() as Promise<
      Record<string, unknown>
    >)
    const chromium = playwrightMod.chromium as {
      launch(opts: Record<string, unknown>): Promise<{
        newContext(opts: Record<string, unknown>): Promise<{
          newPage(): Promise<{
            setDefaultTimeout(t: number): void
            goto(url: string): Promise<unknown>
            screenshot(opts?: Record<string, unknown>): Promise<Uint8Array>
          }>
        }>
        close(): Promise<void>
      }>
    }

    const browser = await chromium.launch({ headless })
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    page.setDefaultTimeout(timeout)

    return {
      async goto(path: string) {
        const url = path.startsWith('http') ? path : `${baseUrl}${path}`
        await page.goto(url)
      },
      async screenshot() {
        const buf = await page.screenshot({ type: 'png' })
        return Buffer.from(buf)
      },
      async act(instruction: string) {
        console.warn(
          `[stagehand-client] act() requires Stagehand AI — instruction ignored: "${instruction}"`,
        )
      },
      async extract<T = unknown>(instruction: string): Promise<T> {
        console.warn(
          `[stagehand-client] extract() requires Stagehand AI — instruction ignored: "${instruction}"`,
        )
        return null as T
      },
      async observe(instruction: string) {
        console.warn(
          `[stagehand-client] observe() requires Stagehand AI — instruction ignored: "${instruction}"`,
        )
        return null
      },
      async close() {
        await browser.close()
      },
    }
  } catch {
    // Playwright not available either
  }

  throw new Error(
    'No browser automation available. Install either @anthropic-ai/stagehand or playwright as optional peer dependencies.',
  )
}
