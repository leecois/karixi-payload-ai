import { describe, expect, it } from 'vitest'
import { buildSchemaManifest } from './src/core/schema-manifest.js'

/** Build a fake payload object minimally compatible with what
 *  buildSchemaManifest and readAllCollectionSchemas read. */
function fakePayload(
  collections: Array<{
    slug: string
    fields: unknown[]
    upload?: boolean
    auth?: boolean
  }>,
  localization?: { locales: Array<string | { code: string }> },
) {
  const collectionsMap: Record<string, { config: unknown }> = {}
  for (const c of collections) {
    collectionsMap[c.slug] = {
      config: { slug: c.slug, fields: c.fields, upload: c.upload, auth: c.auth },
    }
  }
  return {
    collections: collectionsMap,
    config: { localization },
  } as never
}

describe('buildSchemaManifest', () => {
  it('produces the canonical shape for a simple project', () => {
    const payload = fakePayload([
      { slug: 'posts', fields: [{ type: 'text', name: 'title', required: true }] },
      { slug: 'users', fields: [{ type: 'text', name: 'name' }], auth: true },
      { slug: 'media', fields: [{ type: 'text', name: 'alt' }], upload: true },
    ])
    const m = buildSchemaManifest(payload)

    expect(m.manifestVersion).toBe('1')
    expect(m.fingerprint).toMatch(/^[0-9a-z]+$/)
    expect(m.collections).toHaveLength(3)
    expect(m.uploadCollections).toEqual(['media'])
    expect(m.authCollections).toEqual(['users'])
    expect(m.customFieldTypes).toEqual([])
    expect(new Date(m.generatedAt).toString()).not.toBe('Invalid Date')
  })

  it('dedupes block catalog across multiple collections', () => {
    const hero = {
      slug: 'hero',
      fields: [{ type: 'text', name: 'headline' }],
    }
    const payload = fakePayload([
      { slug: 'pages', fields: [{ type: 'blocks', name: 'layout', blocks: [hero] }] },
      { slug: 'landing', fields: [{ type: 'blocks', name: 'sections', blocks: [hero] }] },
    ])
    const m = buildSchemaManifest(payload)
    expect(Object.keys(m.blocks)).toEqual(['hero'])
    expect(m.blocks.hero.fields[0].name).toBe('headline')
  })

  it('tracks blocks nested inside other blocks', () => {
    const nested = { slug: 'inner', fields: [{ type: 'text', name: 'x' }] }
    const outer = {
      slug: 'outer',
      fields: [{ type: 'blocks', name: 'children', blocks: [nested] }],
    }
    const payload = fakePayload([
      { slug: 'pages', fields: [{ type: 'blocks', name: 'layout', blocks: [outer] }] },
    ])
    const m = buildSchemaManifest(payload)
    expect(Object.keys(m.blocks).sort()).toEqual(['inner', 'outer'])
  })

  it('reports customFieldTypes for unknown types', () => {
    const payload = fakePayload([
      {
        slug: 'geo',
        fields: [
          { type: 'text', name: 'label' },
          { type: 'geolocation', name: 'coords' },
          { type: 'slug', name: 'path' },
        ],
      },
    ])
    const m = buildSchemaManifest(payload)
    expect(m.customFieldTypes.sort()).toEqual(['geolocation', 'slug'])
  })

  it('captures lexical editor capabilities per field path', () => {
    const payload = fakePayload([
      {
        slug: 'posts',
        fields: [
          {
            type: 'richText',
            name: 'body',
            editor: {
              editorConfig: {
                features: [
                  { key: 'heading-h2' },
                  { key: 'heading-h3' },
                  { key: 'unorderedlist' },
                  { key: 'link' },
                ],
              },
            },
          },
        ],
      },
    ])
    const m = buildSchemaManifest(payload)
    const editor = m.lexicalEditors['posts.body']
    expect(editor).toBeDefined()
    expect(editor.headingLevels).toEqual([2, 3])
    expect(editor.supportsLists).toBe(true)
    expect(editor.supportsLinks).toBe(true)
    expect(editor.supportsUpload).toBe(false)
  })

  it('reads locales from payload.config.localization', () => {
    const payload = fakePayload([{ slug: 'posts', fields: [{ type: 'text', name: 'title' }] }], {
      locales: ['en', { code: 'fr' }, 'de'],
    })
    const m = buildSchemaManifest(payload)
    expect(m.locales).toEqual(['en', 'fr', 'de'])
  })

  it('falls back to empty locales when no localization config', () => {
    const payload = fakePayload([{ slug: 'posts', fields: [] }])
    const m = buildSchemaManifest(payload)
    expect(m.locales).toEqual([])
  })

  it('allows locales override via options', () => {
    const payload = fakePayload([{ slug: 'posts', fields: [] }])
    const m = buildSchemaManifest(payload, { locales: ['en', 'es'] })
    expect(m.locales).toEqual(['en', 'es'])
  })

  it('fingerprint is stable for identical schemas', () => {
    const fields = [{ type: 'text', name: 'title' }]
    const a = buildSchemaManifest(fakePayload([{ slug: 'posts', fields }]))
    const b = buildSchemaManifest(fakePayload([{ slug: 'posts', fields }]))
    expect(a.fingerprint).toBe(b.fingerprint)
  })

  it('fingerprint differs when schema changes', () => {
    const a = buildSchemaManifest(
      fakePayload([{ slug: 'posts', fields: [{ type: 'text', name: 'title' }] }]),
    )
    const b = buildSchemaManifest(
      fakePayload([{ slug: 'posts', fields: [{ type: 'text', name: 'slug' }] }]),
    )
    expect(a.fingerprint).not.toBe(b.fingerprint)
  })

  it('lists nonPopulatable collections', () => {
    const payload = fakePayload([
      { slug: 'posts', fields: [] },
      { slug: 'orders', fields: [] },
    ])
    const m = buildSchemaManifest(payload)
    expect(m.nonPopulatable).toContain('orders')
  })
})
