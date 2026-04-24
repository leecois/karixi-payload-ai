import { describe, expect, it } from 'vitest'
import { generateDocuments } from './src/core/content-generator.js'
import type { AIProvider, CollectionSchema } from './src/types.js'

function stubProvider(responses: unknown[][]): AIProvider {
  let call = 0
  return {
    async generate() {
      const next = responses[call] ?? responses[responses.length - 1]
      call++
      return next
    },
    async analyzeImage() {
      return 'stub'
    },
  }
}

const richTextSchema: CollectionSchema = {
  slug: 'posts',
  fields: [
    { name: 'title', type: 'text', required: true, path: 'title' },
    { name: 'body', type: 'richText', required: false, path: 'body' },
  ],
  relationships: [],
  requiredFields: ['title'],
  populatable: true,
}

describe('content-generator — richText postprocessing', () => {
  it('converts plain-text richText strings to Lexical JSON', async () => {
    const provider = stubProvider([[{ title: 'Hello', body: 'Line one\nLine two' }]])
    const result = await generateDocuments(provider, richTextSchema, { count: 1 })
    const doc = result.documents[0]
    expect(doc.title).toBe('Hello')
    const body = doc.body as { root: { children: unknown[] } }
    expect(body.root).toBeDefined()
    expect(body.root.children).toHaveLength(2)
  })

  it('converts structured {sections} richText payloads to Lexical JSON', async () => {
    const provider = stubProvider([
      [
        {
          title: 'Structured',
          body: {
            sections: [
              { heading: 'Intro', paragraphs: ['Hi'] },
              { paragraphs: ['Mid'], bulletPoints: ['a', 'b'] },
            ],
          },
        },
      ],
    ])
    const result = await generateDocuments(provider, richTextSchema, { count: 1 })
    const body = result.documents[0].body as { root: { children: Array<{ type: string }> } }
    expect(body.root.children[0].type).toBe('heading')
    expect(body.root.children[1].type).toBe('paragraph')
    expect(body.root.children[2].type).toBe('paragraph')
    expect(body.root.children[3].type).toBe('list')
  })

  it('passes through already-Lexical values untouched', async () => {
    const existingLexical = { root: { type: 'root', children: [], version: 1 } }
    const provider = stubProvider([[{ title: 'Pre', body: existingLexical }]])
    const result = await generateDocuments(provider, richTextSchema, { count: 1 })
    expect(result.documents[0].body).toBe(existingLexical)
  })

  it('postprocesses richText inside group and array fields', async () => {
    const schema: CollectionSchema = {
      slug: 'x',
      fields: [
        {
          name: 'meta',
          type: 'group',
          required: false,
          path: 'meta',
          fields: [{ name: 'summary', type: 'richText', required: false, path: 'meta.summary' }],
        },
        {
          name: 'items',
          type: 'array',
          required: false,
          path: 'items',
          fields: [{ name: 'body', type: 'richText', required: false, path: 'items.body' }],
        },
      ],
      relationships: [],
      requiredFields: [],
      populatable: true,
    }
    const provider = stubProvider([
      [{ meta: { summary: 'group rt' }, items: [{ body: 'item rt' }, { body: 'item rt 2' }] }],
    ])
    const result = await generateDocuments(provider, schema, { count: 1 })
    const doc = result.documents[0] as {
      meta: { summary: { root: unknown } }
      items: Array<{ body: { root: unknown } }>
    }
    expect(doc.meta.summary.root).toBeDefined()
    expect(doc.items[0].body.root).toBeDefined()
    expect(doc.items[1].body.root).toBeDefined()
  })
})

describe('content-generator — blocks validation (opt-in)', () => {
  const schemaWithBlocks: CollectionSchema = {
    slug: 'pages',
    fields: [
      { name: 'title', type: 'text', required: true, path: 'title' },
      {
        name: 'layout',
        type: 'blocks',
        required: false,
        path: 'layout',
        blocks: [
          {
            slug: 'hero',
            fields: [{ name: 'headline', type: 'text', required: true, path: 'layout.headline' }],
            requiredFields: ['headline'],
          },
        ],
      },
    ],
    relationships: [],
    requiredFields: ['title'],
    populatable: true,
  }

  it('when includeBlocks=false (default), blocks field is passed through unchanged', async () => {
    const provider = stubProvider([[{ title: 't', layout: [{ blockType: 'unknown' }] }]])
    const result = await generateDocuments(provider, schemaWithBlocks, { count: 1 })
    const layout = result.documents[0].layout as Array<{ blockType: string }>
    expect(layout).toEqual([{ blockType: 'unknown' }])
  })

  it('when includeBlocks=true, invalid blocks are dropped and retries are triggered', async () => {
    // First response has an invalid block; second response is clean.
    const provider = stubProvider([
      [{ title: 't', layout: [{ blockType: 'mystery' }, { blockType: 'hero', headline: 'ok' }] }],
      [{ title: 't', layout: [{ blockType: 'hero', headline: 'ok' }] }],
    ])
    const result = await generateDocuments(
      provider,
      schemaWithBlocks,
      { count: 1, includeBlocks: true },
      { maxRetries: 2 },
    )
    const layout = result.documents[0].layout as Array<{ blockType: string }>
    expect(layout).toHaveLength(1)
    expect(layout[0].blockType).toBe('hero')
  })

  it('when all retries fail with only invalid blocks, throws with block-specific error', async () => {
    const provider = stubProvider([[{ title: 't', layout: [{ blockType: 'mystery' }] }]])
    await expect(
      generateDocuments(
        provider,
        schemaWithBlocks,
        { count: 1, includeBlocks: true },
        { maxRetries: 0 },
      ),
    ).rejects.toThrow(/unknown blockType/)
  })

  it('accepts a mixed batch: one clean doc + one with invalid blocks (out of retries)', async () => {
    // Multi-doc first response: one valid, one with unknown block
    const provider = stubProvider([
      [
        { title: 'a', layout: [{ blockType: 'hero', headline: 'good' }] },
        { title: 'b', layout: [{ blockType: 'mystery' }] },
      ],
    ])
    const result = await generateDocuments(
      provider,
      schemaWithBlocks,
      { count: 2, includeBlocks: true },
      { maxRetries: 0 },
    )
    // Only the clean document survives validation
    expect(result.documents).toHaveLength(1)
    expect(result.documents[0].title).toBe('a')
  })
})
