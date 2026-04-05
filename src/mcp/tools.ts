import type { PayloadRequest } from 'payload'
import { z } from 'zod'
import { generateDocuments } from '../core/content-generator.js'
import { createProvider } from '../core/providers/base.js'
import { readAllCollectionSchemas, readCollectionSchema } from '../core/schema-reader.js'
import { runBulkPopulation } from '../orchestrate/bulk-runner.js'
import type { AIPluginConfig } from '../types.js'

export type MCPTool = {
  name: string
  description: string
  parameters: Record<string, z.ZodTypeAny>
  handler: (
    args: Record<string, unknown>,
    req: PayloadRequest,
    extra: unknown,
  ) => Promise<{ content: Array<{ text: string; type: 'text' }> }>
}

export function getAITools(pluginConfig: AIPluginConfig): MCPTool[] {
  return [
    {
      name: 'populateCollection',
      description: 'Generate and insert AI-created documents into a Payload CMS collection.',
      parameters: {
        collection: z.string().describe('The collection slug to populate'),
        count: z.number().min(1).max(100).describe('Number of documents to generate'),
        theme: z
          .string()
          .optional()
          .describe('Optional theme or topic to guide content generation'),
      },
      async handler(args, req) {
        const collection = args.collection as string
        const count = args.count as number
        const theme = (args.theme as string | undefined) ?? 'general'

        try {
          const provider = createProvider({
            provider: pluginConfig.provider,
            apiKey: process.env[pluginConfig.apiKeyEnvVar] ?? '',
            baseUrl: pluginConfig.baseUrl,
            model: pluginConfig.model,
          })

          const schema = readCollectionSchema(req.payload, collection)
          const result = await generateDocuments(provider, schema, { count, theme })

          let created = 0
          let failed = 0

          for (const doc of result.documents) {
            try {
              await req.payload.create({
                collection: collection as Parameters<typeof req.payload.create>[0]['collection'],
                data: doc as Record<string, unknown>,
                overrideAccess: true,
                req,
              })
              created++
            } catch {
              failed++
            }
          }

          const text = `Populated "${collection}": ${created} created, ${failed} failed (requested ${count}).`
          return { content: [{ type: 'text', text }] }
        } catch (err) {
          const text = `Error populating "${collection}": ${err instanceof Error ? err.message : String(err)}`
          return { content: [{ type: 'text', text }] }
        }
      },
    },

    {
      name: 'bulkPopulate',
      description:
        'Generate and insert AI-created documents across multiple Payload CMS collections at once.',
      parameters: {
        theme: z
          .string()
          .describe('Theme or topic to guide content generation across all collections'),
        counts: z
          .string()
          .describe('JSON map of collection slug to count, e.g. {"posts":5,"categories":3}'),
      },
      async handler(args, req) {
        const theme = args.theme as string
        const countsRaw = args.counts as string

        let counts: Record<string, number>
        try {
          counts = JSON.parse(countsRaw) as Record<string, number>
        } catch {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: "counts" must be valid JSON, e.g. {"posts":5,"categories":3}',
              },
            ],
          }
        }

        try {
          const provider = createProvider({
            provider: pluginConfig.provider,
            apiKey: process.env[pluginConfig.apiKeyEnvVar] ?? '',
            baseUrl: pluginConfig.baseUrl,
            model: pluginConfig.model,
          })

          const schemas = readAllCollectionSchemas(req.payload)
          const result = await runBulkPopulation(req.payload, req, schemas, {
            theme,
            counts,
            provider,
            rollbackOnError: pluginConfig.rollbackOnError,
          })

          const summary = Object.entries(result.created)
            .map(([slug, n]) => `${slug}: ${n} created, ${result.failed[slug] ?? 0} failed`)
            .join('\n')

          const text = `Bulk population complete in ${result.elapsed}ms${result.rolledBack ? ' (rolled back)' : ''}:\n${summary}`
          return { content: [{ type: 'text', text }] }
        } catch (err) {
          const text = `Error during bulk population: ${err instanceof Error ? err.message : String(err)}`
          return { content: [{ type: 'text', text }] }
        }
      },
    },

    {
      name: 'getCollectionSchema',
      description: 'Return the analyzed schema for a single Payload CMS collection as JSON.',
      parameters: {
        collection: z.string().describe('The collection slug to inspect'),
      },
      async handler(args, req) {
        const collection = args.collection as string

        try {
          const schema = readCollectionSchema(req.payload, collection)
          const text = JSON.stringify(schema, null, 2)
          return { content: [{ type: 'text', text }] }
        } catch (err) {
          const text = `Error reading schema for "${collection}": ${err instanceof Error ? err.message : String(err)}`
          return { content: [{ type: 'text', text }] }
        }
      },
    },

    {
      name: 'listCollections',
      description:
        'List all Payload CMS collections with their field counts and whether they can be auto-populated.',
      parameters: {},
      async handler(_args, req) {
        try {
          const schemas = readAllCollectionSchemas(req.payload)
          const lines = schemas.map(
            (s) => `- ${s.slug}: ${s.fields.length} fields, populatable=${s.populatable}`,
          )
          const text = `Collections (${schemas.length}):\n${lines.join('\n')}`
          return { content: [{ type: 'text', text }] }
        } catch (err) {
          const text = `Error listing collections: ${err instanceof Error ? err.message : String(err)}`
          return { content: [{ type: 'text', text }] }
        }
      },
    },
  ]
}
