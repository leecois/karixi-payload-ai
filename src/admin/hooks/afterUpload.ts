import type { CollectionAfterChangeHook } from 'payload'
import type { AIPluginConfig } from '../../types.js'

/**
 * Creates an afterChange hook for the media collection that auto-generates alt text.
 * Only runs on 'create' operations where alt text is empty.
 */
export function createAltTextHook(pluginConfig: AIPluginConfig): CollectionAfterChangeHook {
  return async ({ doc, operation, req }) => {
    if (operation !== 'create') return doc

    // Only process if alt is empty
    if (doc.alt && String(doc.alt).trim() !== '') return doc

    const apiKey = process.env[pluginConfig.apiKeyEnvVar]
    if (!apiKey) return doc

    // Check if there's an uploaded file URL to analyze
    const imageUrl = doc.url || doc.filename
    if (!imageUrl) return doc

    try {
      // TODO: Use AI vision API (provider.analyzeImage) to analyze actual image content.
      // For now, generate descriptive alt text from the filename.
      const filename = doc.filename || 'image'
      const cleanName = String(filename)
        .replace(/[-_]/g, ' ')
        .replace(/\.[^.]+$/, '')

      const altText = `${cleanName} - uploaded media`

      // Update the document with generated alt text
      await req.payload.update({
        collection: 'media',
        id: doc.id as string,
        data: { alt: altText },
        req,
      })

      return { ...doc, alt: altText }
    } catch (err) {
      console.warn('[@karixi/payload-ai] Alt text generation failed:', err)
      return doc
    }
  }
}
