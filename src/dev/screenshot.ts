/** Screenshot capture with viewport presets */

export type ScreenshotOptions = {
  url: string
  viewport?: 'mobile' | 'desktop' | { width: number; height: number }
  headless?: boolean
  timeout?: number
}

export type ScreenshotResult = {
  buffer: Buffer
  width: number
  height: number
  url: string
  viewport: { width: number; height: number }
}

const VIEWPORT_PRESETS = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1440, height: 900 },
} as const

function resolveViewport(viewport: ScreenshotOptions['viewport']): {
  width: number
  height: number
} {
  if (!viewport || viewport === 'desktop') return VIEWPORT_PRESETS.desktop
  if (viewport === 'mobile') return VIEWPORT_PRESETS.mobile
  return viewport
}

export async function captureScreenshot(options: ScreenshotOptions): Promise<ScreenshotResult> {
  const { url, viewport: viewportOption, headless = true, timeout } = options
  const resolved = resolveViewport(viewportOption)

  const { createStagehandClient } = await import('./stagehand-client')

  // Derive baseUrl from the full URL
  const parsed = new URL(url)
  const baseUrl = `${parsed.protocol}//${parsed.host}`
  const path = parsed.pathname + parsed.search + parsed.hash

  const client = await createStagehandClient({
    baseUrl,
    headless,
    viewport: resolved,
    ...(timeout !== undefined ? { timeout } : {}),
  })

  try {
    await client.goto(path)
    const buffer = await client.screenshot()
    return {
      buffer,
      width: resolved.width,
      height: resolved.height,
      url,
      viewport: resolved,
    }
  } finally {
    await client.close()
  }
}

export function compareScreenshots(
  before: ScreenshotResult,
  after: ScreenshotResult,
): { changed: boolean; description: string } {
  const same = Buffer.compare(before.buffer, after.buffer) === 0
  if (same) {
    return { changed: false, description: 'Screenshots are identical.' }
  }
  return {
    changed: true,
    description: `Screenshots differ (before: ${before.buffer.length} bytes, after: ${after.buffer.length} bytes).`,
  }
}
