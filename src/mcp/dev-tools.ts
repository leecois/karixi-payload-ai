/** Phase 5 — MCP dev tool integrations (screenshot, visual diff, form testing) */

import { z } from 'zod'
import type { AIPluginConfig } from '../types.js'
import type { MCPTool } from './tools.js'

/** Get dev tools for MCP registration. Returns empty array if Stagehand/Playwright not available. */
export async function getDevTools(pluginConfig: AIPluginConfig): Promise<MCPTool[]> {
  // ESM-compatible detection: try stagehand OR playwright
  try {
    try {
      await (Function('return import("@anthropic-ai/stagehand")')() as Promise<unknown>)
    } catch {
      await (Function('return import("playwright")')() as Promise<unknown>)
    }
  } catch {
    console.log(
      '[@karixi/payload-ai] Dev tools disabled: neither Stagehand nor Playwright installed',
    )
    return []
  }

  return [
    {
      name: 'screenshot',
      description: 'Capture a screenshot of a page at a given URL with configurable viewport',
      parameters: {
        url: z.string().describe('Page URL or path (e.g., /products)'),
        viewport: z.enum(['mobile', 'desktop']).optional().describe('Viewport preset'),
        baseUrl: z.string().optional().describe('Base URL (default: http://localhost:3000)'),
      },
      handler: async (args, _req, _extra) => {
        const { captureScreenshot } = (await import(
          '../dev/screenshot.js'
        )) as typeof import('../dev/screenshot.js')
        const url = args.url as string
        const viewport = (args.viewport as 'mobile' | 'desktop') ?? 'desktop'
        const baseUrl = args.baseUrl as string | undefined
        const targetUrl = baseUrl ? `${baseUrl}${url}` : url
        const result = await captureScreenshot({ url: targetUrl, viewport })
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  message: `Screenshot captured: ${result.url} at ${result.viewport.width}x${result.viewport.height}`,
                  size: result.buffer.length,
                  viewport: result.viewport,
                  image: result.buffer.toString('base64'),
                },
                null,
                2,
              ),
            },
          ],
        }
      },
    },

    {
      name: 'visual_diff',
      description: 'Analyze a page screenshot for visual issues using AI vision',
      parameters: {
        url: z.string().describe('Page URL or path'),
        component: z.string().optional().describe('Component name to focus on'),
        expectedBehavior: z.string().optional().describe('What the page should look like'),
        baseUrl: z.string().optional().describe('Base URL'),
      },
      handler: async (args, _req, _extra) => {
        const { captureScreenshot } = (await import(
          '../dev/screenshot.js'
        )) as typeof import('../dev/screenshot.js')
        const { analyzeScreenshot } = (await import(
          '../dev/visual-debugger.js'
        )) as typeof import('../dev/visual-debugger.js')
        const { createProvider } = (await import(
          '../core/providers/base.js'
        )) as typeof import('../core/providers/base.js')

        const url = args.url as string
        const baseUrl = args.baseUrl as string | undefined
        const component = args.component as string | undefined
        const expectedBehavior = args.expectedBehavior as string | undefined
        const targetUrl = baseUrl ? `${baseUrl}${url}` : url

        const context =
          [
            component && `Component: ${component}`,
            expectedBehavior && `Expected: ${expectedBehavior}`,
          ]
            .filter(Boolean)
            .join('\n') || undefined

        const provider = createProvider({
          provider: pluginConfig.provider,
          apiKey: process.env[pluginConfig.apiKeyEnvVar] ?? '',
        })

        const screenshot = await captureScreenshot({ url: targetUrl })
        const result = await analyzeScreenshot(provider, screenshot, context)

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        }
      },
    },

    {
      name: 'test_form',
      description: 'Discover and test all form fields on a page',
      parameters: {
        url: z.string().describe('Page URL or path with forms'),
        baseUrl: z.string().optional().describe('Base URL'),
      },
      handler: async (args, _req, _extra) => {
        const { testForms } = (await import(
          '../dev/form-tester.js'
        )) as typeof import('../dev/form-tester.js')
        const result = await testForms({
          url: args.url as string,
          baseUrl: args.baseUrl as string | undefined,
        })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        }
      },
    },

    {
      name: 'edit_test_fix',
      description:
        'Run an autonomous edit-test-fix loop: screenshot → analyze → suggest fix → repeat',
      parameters: {
        url: z.string().describe('Page URL to debug'),
        issue: z.string().describe('Description of the visual issue'),
        maxIterations: z.number().optional().describe('Max iterations (default 5)'),
        baseUrl: z.string().optional().describe('Base URL'),
      },
      handler: async (args, _req, _extra) => {
        const { runEditTestFix } = (await import(
          '../dev/edit-test-fix.js'
        )) as typeof import('../dev/edit-test-fix.js')
        const { createProvider } = (await import(
          '../core/providers/base.js'
        )) as typeof import('../core/providers/base.js')

        const provider = createProvider({
          provider: pluginConfig.provider,
          apiKey: process.env[pluginConfig.apiKeyEnvVar] ?? '',
        })

        const result = await runEditTestFix({
          url: args.url as string,
          issueDescription: args.issue as string,
          baseUrl: args.baseUrl as string | undefined,
          maxIterations: args.maxIterations as number | undefined,
          provider,
        })

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        }
      },
    },
  ]
}
