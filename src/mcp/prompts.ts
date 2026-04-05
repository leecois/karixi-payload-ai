import type { PayloadRequest } from 'payload'
import { z } from 'zod'

export type MCPPrompt = {
  name: string
  title: string
  description: string
  argsSchema: Record<string, z.ZodTypeAny>
  handler: (
    args: Record<string, unknown>,
    req: PayloadRequest,
    extra: unknown,
  ) => { messages: Array<{ content: { text: string; type: 'text' }; role: 'user' | 'assistant' }> }
}

export function getAIPrompts(): MCPPrompt[] {
  return [
    {
      name: 'generateContentBrief',
      title: 'Generate Content Brief',
      description:
        'Produce a structured brief that guides AI content generation for a given collection and theme.',
      argsSchema: {
        collection: z.string().describe('The collection slug to generate content for'),
        theme: z.string().describe('The overarching theme or topic for the content'),
        count: z.number().describe('Number of documents to generate'),
      },
      handler(args) {
        const collection = args.collection as string
        const theme = args.theme as string
        const count = args.count as number

        const text = [
          `You are preparing a content generation brief for the Payload CMS collection: **${collection}**.`,
          '',
          `**Theme**: ${theme}`,
          `**Documents to generate**: ${count}`,
          '',
          'Please produce a structured brief that includes:',
          '1. A short description of the content style and tone that fits the theme.',
          '2. Key topics or sub-themes each document should cover.',
          '3. Any field-level guidance (titles, descriptions, categories, tags) relevant to this collection.',
          '4. Example values for the most important fields.',
          '',
          `Output the brief as a JSON object with keys: style, topics, fieldGuidance, examples.`,
        ].join('\n')

        return {
          messages: [
            {
              role: 'user',
              content: { type: 'text', text },
            },
          ],
        }
      },
    },

    {
      name: 'reviewGeneratedContent',
      title: 'Review Generated Content',
      description:
        'Return a review prompt asking an AI to evaluate and suggest improvements for a generated document.',
      argsSchema: {
        collection: z.string().describe('The collection slug the document belongs to'),
        documentId: z.string().describe('The ID of the document to review'),
      },
      handler(args) {
        const collection = args.collection as string
        const documentId = args.documentId as string

        const text = [
          `Please review the following generated document.`,
          '',
          `**Collection**: ${collection}`,
          `**Document ID**: ${documentId}`,
          '',
          'Evaluate the document on:',
          '1. **Accuracy** — Is the content factually plausible and internally consistent?',
          '2. **Completeness** — Are all important fields populated with meaningful values?',
          '3. **Quality** — Is the writing style appropriate and free of obvious AI artifacts?',
          '4. **Schema compliance** — Do field values match the expected types and constraints?',
          '',
          'Provide a structured review with a score (1–10) for each criterion and specific suggestions for improvement.',
        ].join('\n')

        return {
          messages: [
            {
              role: 'user',
              content: { type: 'text', text },
            },
          ],
        }
      },
    },
  ]
}
