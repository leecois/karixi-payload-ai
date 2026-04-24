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

    // Collect every empty enabled field into a single sub-schema. Inject
    // each field's per-field prompt as metadata.aiHint so the batched
    // generation prompt preserves the guidance. Then issue ONE generate
    // call for all fields instead of N.
    const schema = readCollectionSchema(req.payload, collectionSlug, {
      nonPopulatableSlugs: pluginConfig.nonPopulatableSlugs,
      replaceDefaults: pluginConfig.replaceNonPopulatableDefaults,
    })

    const fieldsToFill: typeof schema.fields = []
    const fieldPrompts: string[] = []
    for (const [fieldName, fieldConfig] of Object.entries(collectionConfig.fields)) {
      if (!fieldConfig.enabled) continue
      const currentValue = (data as Record<string, unknown>)[fieldName]
      if (currentValue !== undefined && currentValue !== null && currentValue !== '') continue
      const fieldSchema = schema.fields.find((f) => f.name === fieldName)
      if (!fieldSchema) continue
      const hinted = fieldConfig.prompt
        ? {
            ...fieldSchema,
            metadata: { ...fieldSchema.metadata, aiHint: fieldConfig.prompt },
          }
        : fieldSchema
      fieldsToFill.push(hinted)
      if (fieldConfig.prompt) fieldPrompts.push(fieldConfig.prompt)
    }

    if (fieldsToFill.length === 0) return data

    try {
      const result = await generateDocuments(
        provider,
        {
          ...schema,
          fields: fieldsToFill,
          requiredFields: fieldsToFill.filter((f) => f.required).map((f) => f.name),
        },
        {
          count: 1,
          // Combined theme from per-field prompts gives the model a single
          // coherent brief across all fields being filled at once.
          theme: fieldPrompts.length > 0 ? fieldPrompts.join('; ') : undefined,
          ...(pluginConfig.domain !== undefined ? { domain: pluginConfig.domain } : {}),
        },
      )

      const generated = result.documents[0]
      if (generated) {
        for (const field of fieldsToFill) {
          const value = generated[field.name]
          if (value !== undefined) {
            ;(data as Record<string, unknown>)[field.name] = value
          }
        }
      }
    } catch (err) {
      console.warn(
        `[@karixi/payload-ai] Smart defaults batch failed for ${fieldsToFill
          .map((f) => f.name)
          .join(', ')}:`,
        err,
      )
    }

    return data
  }
}
