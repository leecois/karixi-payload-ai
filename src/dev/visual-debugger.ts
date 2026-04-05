/** AI-powered visual analysis of screenshots */

import type { AIProvider } from '../types'
import type { ScreenshotResult } from './screenshot'

export type VisualIssue = {
  severity: 'low' | 'medium' | 'high'
  description: string
  suggestion: string
}

export type VisualDebugResult = {
  issues: VisualIssue[]
  summary: string
}

function parseIssues(response: string): VisualIssue[] {
  const trimmed = response.trim()
  const match = trimmed.match(/\[[\s\S]*\]/)
  if (!match) return []

  try {
    const parsed: unknown = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return []

    return parsed.flatMap((item: unknown): VisualIssue[] => {
      if (
        typeof item !== 'object' ||
        item === null ||
        !('severity' in item) ||
        !('description' in item) ||
        !('suggestion' in item)
      ) {
        return []
      }
      const { severity, description, suggestion } = item as Record<string, unknown>
      if (
        (severity !== 'low' && severity !== 'medium' && severity !== 'high') ||
        typeof description !== 'string' ||
        typeof suggestion !== 'string'
      ) {
        return []
      }
      return [{ severity, description, suggestion }]
    })
  } catch {
    return []
  }
}

function buildSummary(issues: VisualIssue[]): string {
  if (issues.length === 0) return 'No visual issues detected.'
  const high = issues.filter((i) => i.severity === 'high').length
  const medium = issues.filter((i) => i.severity === 'medium').length
  const low = issues.filter((i) => i.severity === 'low').length
  const parts: string[] = []
  if (high > 0) parts.push(`${high} high`)
  if (medium > 0) parts.push(`${medium} medium`)
  if (low > 0) parts.push(`${low} low`)
  return `Found ${issues.length} issue${issues.length === 1 ? '' : 's'}: ${parts.join(', ')} severity.`
}

export async function analyzeScreenshot(
  provider: AIProvider,
  screenshot: ScreenshotResult | Buffer,
  context?: string,
): Promise<VisualDebugResult> {
  const buffer = Buffer.isBuffer(screenshot) ? screenshot : screenshot.buffer

  // AIProvider.analyzeImage takes a Buffer and returns a string analysis.
  // We pass the screenshot buffer; the provider's system prompt handles visual analysis.
  // If context is provided, we embed it in the buffer as a prefixed PNG comment isn't
  // practical — instead we call generate() with the image response as input.
  const imageAnalysis = await provider.analyzeImage(buffer)

  let finalAnalysis = imageAnalysis
  if (context) {
    // Use generate() to refine the analysis with additional context
    const refinedResults = await provider.generate(
      `Given this visual analysis of an admin UI screenshot:\n${imageAnalysis}\n\nAdditional context: ${context}\n\nIdentify visual issues and respond with a JSON array:\n[{"severity":"low"|"medium"|"high","description":"...","suggestion":"..."}]\nReturn only the JSON array.`,
      {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: ['low', 'medium', 'high'] },
            description: { type: 'string' },
            suggestion: { type: 'string' },
          },
        },
      },
    )
    finalAnalysis = JSON.stringify(refinedResults)
  }

  const issues = parseIssues(finalAnalysis)
  const summary = buildSummary(issues)

  return { issues, summary }
}
