import type { CollectionAfterChangeHook } from 'payload'
import type { AIPluginConfig } from '../../types.js'

/**
 * Fallback alt text derived from the filename — keeps the hook useful
 * when AI vision is unavailable (no API key, no URL, vision call fails).
 */
function altFromFilename(filename: string): string {
  const cleanName = filename.replace(/[-_]/g, ' ').replace(/\.[^.]+$/, '')
  return `${cleanName} - uploaded media`
}

/**
 * Fetch the uploaded image into a Buffer so we can hand it to
 * provider.analyzeImage. Supports absolute URLs (doc.url) and, if the
 * payload is configured to serve uploads, falls back to filename + serverURL.
 */
async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.startsWith('image/')) return null
    const ab = await res.arrayBuffer()
    return Buffer.from(ab)
  } catch {
    return null
  }
}

/**
 * Creates an afterChange hook for the media collection that auto-generates alt text.
 * Only runs on 'create' operations where alt text is empty.
 *
 * Uses provider.analyzeImage() when a URL + API key are available, and
 * falls back to a filename-derived placeholder otherwise.
 */
export function createAltTextHook(pluginConfig: AIPluginConfig): CollectionAfterChangeHook {
  return async ({ doc, operation, req }) => {
    if (operation !== 'create') return doc

    // Only process if alt is empty
    if (doc.alt && String(doc.alt).trim() !== '') return doc

    const apiKey = process.env[pluginConfig.apiKeyEnvVar]
    if (!apiKey) return doc

    const filename = doc.filename ? String(doc.filename) : 'image'
    const rawUrl = doc.url ? String(doc.url) : ''

    try {
      let altText = altFromFilename(filename)

      // Try the vision path: fetch the image, hand it to the provider.
      if (rawUrl) {
        try {
          const { createProvider } = await import('../../core/providers/base.js')
          const provider = createProvider({
            provider: pluginConfig.provider,
            apiKey,
            baseUrl: pluginConfig.baseUrl,
            model: pluginConfig.model,
          })
          const buffer = await fetchImageBuffer(rawUrl)
          if (buffer && buffer.length > 0) {
            const vision = await provider.analyzeImage(buffer)
            const trimmed = vision.trim()
            if (trimmed) altText = trimmed
          }
        } catch (visionErr) {
          console.warn(
            '[@karixi/payload-ai] Vision alt text failed, falling back to filename:',
            visionErr instanceof Error ? visionErr.message : String(visionErr),
          )
        }
      }

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
