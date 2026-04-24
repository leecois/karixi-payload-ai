import type { Payload } from 'payload'
import type { BlockSchema, CollectionSchema, FieldSchema } from '../types.js'
import { readAllCollectionSchemas, type SchemaReaderOptions } from './schema-reader.js'

/**
 * The universal handshake artifact for this plugin.
 *
 * A SchemaManifest is a single JSON object that fully describes a Payload
 * project's shape in a form any MCP client can consume: collections,
 * deduplicated block catalog, lexical editor capabilities, custom field
 * types that the core adapters don't recognize, locales, upload
 * collections, and a config fingerprint for caching.
 *
 * Produced by buildSchemaManifest(payload) — exposed via MCP as the
 * `describePayloadProject` tool and the `schema://manifest` resource.
 */
export type SchemaManifest = {
  collections: CollectionSchema[]
  /** Dedup'd block catalog keyed by block slug (blocks can be reused across
   *  many fields; the catalog lists each slug once with its sub-fields). */
  blocks: Record<string, BlockSchema>
  /** Rich-text editor capability per fully-qualified field path */
  lexicalEditors: Record<
    string,
    {
      features: string[]
      headingLevels: number[]
      supportsLists: boolean
      supportsUpload: boolean
      supportsRelationship: boolean
      supportsLinks: boolean
    }
  >
  /** Collection slugs whose Payload config declares `upload: true` */
  uploadCollections: string[]
  /** Collection slugs whose Payload config declares `auth: true` */
  authCollections: string[]
  /** Field types the adapter registry does not know about (custom plugins) */
  customFieldTypes: string[]
  /** Configured locales (if any). Empty when project is single-locale. */
  locales: string[]
  /** Collections considered non-populatable by the schema reader */
  nonPopulatable: string[]
  /** Stable hash of the manifest contents, for caching/invalidation */
  fingerprint: string
  /** Manifest version so future MCP clients can handshake */
  manifestVersion: '1'
  /** ISO timestamp when the manifest was produced */
  generatedAt: string
}

const NATIVE_FIELD_TYPES = new Set([
  'text',
  'textarea',
  'email',
  'number',
  'checkbox',
  'date',
  'select',
  'radio',
  'relationship',
  'upload',
  'richText',
  'blocks',
  'array',
  'group',
  'row',
  'tabs',
  'collapsible',
  'point',
  'json',
  'code',
  'ui',
])

function collectBlocks(
  fields: FieldSchema[],
  out: Record<string, BlockSchema>,
  customTypes: Set<string>,
): void {
  for (const f of fields) {
    if (!NATIVE_FIELD_TYPES.has(f.type)) customTypes.add(f.type)
    if (f.blocks) {
      for (const b of f.blocks) {
        // First occurrence wins; later identical slugs are ignored.
        if (!(b.slug in out)) out[b.slug] = b
        collectBlocks(b.fields, out, customTypes)
      }
    }
    if (f.fields) collectBlocks(f.fields, out, customTypes)
  }
}

function collectLexicalEditors(
  collectionSlug: string,
  fields: FieldSchema[],
  out: SchemaManifest['lexicalEditors'],
): void {
  for (const f of fields) {
    if (f.type === 'richText') {
      const features = f.lexicalFeatures ?? []
      const headingLevels: number[] = []
      for (const feat of features) {
        const m = feat.match(/h([1-6])/i)
        if (m) headingLevels.push(Number.parseInt(m[1], 10))
      }
      if (
        headingLevels.length === 0 &&
        features.some((x) => /heading/i.test(x) && !/h[1-6]/i.test(x))
      ) {
        headingLevels.push(2, 3, 4)
      }
      const supportsLists = features.some((x) => /list|bullet|number|ordered/i.test(x))
      const supportsUpload = features.some((x) => /upload|image/i.test(x))
      const supportsRelationship = features.some((x) => /relation/i.test(x))
      const supportsLinks = features.some((x) => /link/i.test(x))
      out[`${collectionSlug}.${f.path}`] = {
        features,
        headingLevels: [...new Set(headingLevels)].sort((a, b) => a - b),
        supportsLists,
        supportsUpload,
        supportsRelationship,
        supportsLinks,
      }
    }
    if (f.fields) collectLexicalEditors(collectionSlug, f.fields, out)
    if (f.blocks) for (const b of f.blocks) collectLexicalEditors(collectionSlug, b.fields, out)
  }
}

/** Fast non-crypto hash (djb2) for fingerprinting. */
function fingerprint(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

export type BuildManifestOptions = SchemaReaderOptions & {
  /** Override locales if not available from payload.config.localization */
  locales?: string[]
}

export function buildSchemaManifest(
  payload: Payload,
  options?: BuildManifestOptions,
): SchemaManifest {
  const collections = readAllCollectionSchemas(payload, options)

  const blocks: Record<string, BlockSchema> = {}
  const customTypes = new Set<string>()
  const lexicalEditors: SchemaManifest['lexicalEditors'] = {}
  const uploadCollections: string[] = []
  const authCollections: string[] = []

  for (const c of collections) {
    collectBlocks(c.fields, blocks, customTypes)
    collectLexicalEditors(c.slug, c.fields, lexicalEditors)

    const entry = (payload.collections as unknown as Record<string, { config?: unknown }>)[c.slug]
    const cfg = (entry?.config ?? {}) as Record<string, unknown>
    if (cfg.upload) uploadCollections.push(c.slug)
    if (cfg.auth) authCollections.push(c.slug)
  }

  const nonPopulatable = collections.filter((c) => !c.populatable).map((c) => c.slug)

  // Try to extract locales from payload.config
  const payloadCfg = (payload as unknown as { config?: Record<string, unknown> }).config
  const localization = payloadCfg?.localization as
    | { locales?: Array<string | { code: string }> }
    | undefined
  const locales =
    options?.locales ??
    (localization?.locales
      ? localization.locales.map((l) => (typeof l === 'string' ? l : l.code))
      : [])

  const manifest: Omit<SchemaManifest, 'fingerprint'> = {
    collections,
    blocks,
    lexicalEditors,
    uploadCollections,
    authCollections,
    customFieldTypes: [...customTypes].sort(),
    locales,
    nonPopulatable,
    manifestVersion: '1',
    generatedAt: new Date().toISOString(),
  }

  return {
    ...manifest,
    fingerprint: fingerprint(
      JSON.stringify({
        collections: collections.map((c) => ({
          slug: c.slug,
          fields: c.fields.map((f) => ({ name: f.name, type: f.type, path: f.path })),
        })),
      }),
    ),
  }
}
