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
          'To discover the entire project (collections + blocks + lexical editors + locales + custom field types) in one call, use the `describePayloadProject` tool.',
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
    {
      name: 'schemaManifestHowTo',
      title: 'Schema Manifest Usage',
      description:
        'Explains how to consume the full Schema Manifest emitted by the describePayloadProject tool.',
      uri: 'schema://manifest',
      mimeType: 'text/plain',
      handler() {
        const text = [
          'The Schema Manifest is the single source of truth for this Payload project.',
          '',
          'Call the `describePayloadProject` MCP tool to receive it. Shape:',
          '  {',
          '    collections: CollectionSchema[],',
          "    blocks: { [slug]: BlockSchema }      // dedup'd global block catalog",
          '    lexicalEditors: { [collection.field]: { features, headingLevels, supportsLists, supportsUpload, supportsRelationship, supportsLinks } }',
          '    uploadCollections: string[]',
          '    authCollections: string[]',
          '    customFieldTypes: string[]            // field types not in the built-in adapter set',
          '    locales: string[]',
          '    nonPopulatable: string[]',
          '    fingerprint: string                   // cache key',
          '    manifestVersion: "1"',
          '    generatedAt: string                   // ISO timestamp',
          '  }',
          '',
          'Recommended flow: call describePayloadProject once per session, cache by fingerprint, then use populateCollection / bulkPopulate with the knowledge of block catalogs and lexical capabilities.',
          'To get a lightweight summary without every field tree, pass { includeFields: false } to describePayloadProject.',
        ].join('\n')
        return { contents: [{ uri: 'schema://manifest', text }] }
      },
    },
  ]
}
