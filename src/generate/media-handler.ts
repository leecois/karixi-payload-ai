import type { Payload, PayloadRequest } from 'payload'

export type MediaSource = 'unsplash' | 'placeholder'

function generatePlaceholderSvg(options: {
  query?: string
  alt: string
  width: number
  height: number
}): Buffer {
  const { alt, width, height } = options

  // Generate a deterministic hue from the alt text
  let hash = 0
  for (let i = 0; i < alt.length; i++) {
    hash = ((hash << 5) - hash + alt.charCodeAt(i)) | 0
  }
  const hue = Math.abs(hash) % 360
  const bg = `hsl(${hue}, 40%, 75%)`
  const fg = `hsl(${hue}, 40%, 25%)`

  // Truncate label text for display
  const label = alt.length > 30 ? `${alt.slice(0, 27)}...` : alt

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  <text x="${width / 2}" y="${height / 2}" font-family="system-ui,sans-serif" font-size="${Math.max(12, Math.min(24, width / 12))}" fill="${fg}" text-anchor="middle" dominant-baseline="middle">${label}</text>
  <text x="${width / 2}" y="${height / 2 + Math.max(16, Math.min(30, width / 10))}" font-family="system-ui,sans-serif" font-size="${Math.max(10, Math.min(16, width / 18))}" fill="${fg}" opacity="0.6" text-anchor="middle" dominant-baseline="middle">${width}×${height}</text>
</svg>`

  return Buffer.from(svg, 'utf-8')
}

/**
 * Upload media to Payload CMS.
 * - 'placeholder': generates a colored SVG with a text label
 * - 'unsplash': stub — falls back to placeholder
 *
 * Returns the created media document ID.
 */
export async function uploadMedia(
  payload: Payload,
  req: PayloadRequest,
  options: {
    source: MediaSource
    query?: string
    alt: string
    width?: number
    height?: number
  },
): Promise<string> {
  const width = options.width ?? 800
  const height = options.height ?? 600

  if (options.source === 'unsplash') {
    console.log(
      `[media-handler] Unsplash integration is not yet implemented. Falling back to placeholder for query: "${options.query ?? options.alt}"`,
    )
  }

  const buffer = generatePlaceholderSvg({ query: options.query, alt: options.alt, width, height })

  const doc = await payload.create({
    collection: 'media',
    data: { alt: options.alt },
    file: {
      data: buffer,
      mimetype: 'image/svg+xml',
      name: 'placeholder.svg',
      size: buffer.length,
    },
    overrideAccess: true,
    req,
  })

  return String(doc.id)
}
