export type MCPResource = {
  name: string
  title: string
  description: string
  uri: string
  mimeType: string
  handler: (...args: unknown[]) => { contents: Array<{ text: string; uri: string }> }
}

export function getAIResources(): MCPResource[] {
  return [
    {
      name: 'schemaOverview',
      title: 'Collection Schema Overview',
      description:
        'A high-level overview of all Payload CMS collections including their slugs, field counts, and populatable status.',
      uri: 'schema://collections',
      mimeType: 'text/plain',
      handler() {
        const text = [
          'This resource provides a schema overview of all registered Payload CMS collections.',
          '',
          'To retrieve the full schema for a specific collection, use the `getCollectionSchema` tool.',
          'To list all collections with field counts and populatable status, use the `listCollections` tool.',
          'To generate documents into a single collection, use the `populateCollection` tool.',
          'To populate multiple collections at once, use the `bulkPopulate` tool.',
          '',
          'All schema information is derived from the live Payload configuration at runtime.',
        ].join('\n')

        return {
          contents: [
            {
              uri: 'schema://collections',
              text,
            },
          ],
        }
      },
    },
  ]
}
