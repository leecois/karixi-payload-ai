/** Phase 5 — Iterative edit-test-fix loop for AI-assisted UI debugging */

import type { AIProvider } from '../types.js'

export type EditTestFixConfig = {
  url: string
  issueDescription: string
  baseUrl?: string
  maxIterations?: number
  provider: AIProvider
}

export type EditTestFixResult = {
  iterations: number
  converged: boolean
  fixes: Array<{
    iteration: number
    analysis: string
    suggestedEdit: { file: string; line?: number; patch: string } | null
    screenshotChanged: boolean
  }>
  finalAnalysis: string
}

/** Run an autonomous edit-test-fix loop */
export async function runEditTestFix(config: EditTestFixConfig): Promise<EditTestFixResult> {
  const { captureScreenshot, compareScreenshots } = (await import(
    './screenshot.js'
  )) as typeof import('./screenshot.js')
  const { analyzeScreenshot } = (await import(
    './visual-debugger.js'
  )) as typeof import('./visual-debugger.js')

  const maxIterations = config.maxIterations ?? 5
  const fixes: EditTestFixResult['fixes'] = []
  let previousResult: import('./screenshot.js').ScreenshotResult | null = null
  let converged = false

  // biome-ignore lint/correctness/noUnreachable: loop scaffolding for future edit-apply implementation
  for (let i = 1; i <= maxIterations; i++) {
    // 1. Screenshot current state
    const targetUrl = config.baseUrl ? `${config.baseUrl}${config.url}` : config.url
    const result = await captureScreenshot({
      url: targetUrl,
      viewport: 'desktop',
    })

    // 2. Check convergence (consecutive screenshots identical)
    if (previousResult) {
      const diff = compareScreenshots(previousResult, result)
      if (!diff.changed) {
        converged = true
        fixes.push({
          iteration: i,
          analysis: 'No visual changes detected — converged.',
          suggestedEdit: null,
          screenshotChanged: false,
        })
        break
      }
    }

    // 3. AI analyzes the issue
    const analysis = await analyzeScreenshot(config.provider, result, config.issueDescription)

    // 4. Record the fix suggestion
    const topIssue = analysis.issues[0]
    fixes.push({
      iteration: i,
      analysis: analysis.summary,
      suggestedEdit: topIssue ? { file: 'unknown', patch: topIssue.suggestion } : null,
      screenshotChanged: true,
    })

    // 5. If no issues found, we're done
    if (analysis.issues.length === 0) {
      converged = true
      break
    }

    // In a real implementation, the suggested edit would be applied and the
    // loop would continue. Here we report the suggestion for the calling
    // agent (Claude Code) to apply, then stop.
    previousResult = result
    break
  }

  return {
    iterations: fixes.length,
    converged,
    fixes,
    finalAnalysis: fixes[fixes.length - 1]?.analysis ?? 'No analysis performed',
  }
}
