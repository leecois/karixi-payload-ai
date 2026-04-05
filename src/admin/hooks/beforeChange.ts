import type { CollectionBeforeChangeHook } from 'payload'
import type { AIPluginConfig } from '../../types.js'

/**
 * Creates a beforeChange hook that auto-fills empty fields with AI content.
 * Only runs on 'create' operations. Only fills fields configured in AIPluginConfig.
 */
export function createSmartDefaultsHook(
  pluginConfig: AIPluginConfig,
  collectionSlug: string,
): CollectionBeforeChangeHook {
  return async ({ data, operation, req }) => {
    if (operation !== 'create') return data

    const collectionConfig = pluginConfig.collections?.[collectionSlug]
    if (!collectionConfig?.fields) return data

    const apiKey = process.env[pluginConfig.apiKeyEnvVar]
    if (!apiKey) return data

    // Import dynamically to avoid circular deps
    const { createProvider } = await import('../../core/providers/base.js')
    const { readCollectionSchema } = await import('../../core/schema-reader.js')
    const { generateDocuments } = await import('../../core/content-generator.js')

    const provider = createProvider({
      provider: pluginConfig.provider,
      apiKey,
      baseUrl: pluginConfig.baseUrl,
      model: pluginConfig.model,
    })

    // For each configured field that is empty in the data, generate a value
    for (const [fieldName, fieldConfig] of Object.entries(collectionConfig.fields)) {
      if (!fieldConfig.enabled) continue
      const currentValue = (data as Record<string, unknown>)[fieldName]
      if (currentValue !== undefined && currentValue !== null && currentValue !== '') continue

      try {
        const schema = readCollectionSchema(req.payload, collectionSlug)
        const fieldSchema = schema.fields.find((f) => f.name === fieldName)
        if (!fieldSchema) continue

        const result = await generateDocuments(
          provider,
          {
            ...schema,
            fields: [fieldSchema],
            requiredFields: [fieldName],
          },
          { count: 1, theme: fieldConfig.prompt },
        )

        const generated = result.documents[0]
        if (generated?.[fieldName] !== undefined) {
          ;(data as Record<string, unknown>)[fieldName] = generated[fieldName]
        }
      } catch (err) {
        console.warn(`[@karixi/payload-ai] Smart default failed for ${fieldName}:`, err)
      }
    }

    return data
  }
}
