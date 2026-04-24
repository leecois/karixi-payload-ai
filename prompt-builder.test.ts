import { describe, expect, it } from 'vitest'
import { buildGenerationPrompt, buildOutputSchema } from './src/core/prompt-builder.js'
import type { CollectionSchema } from './src/types.js'

function baseSchema(overrides: Partial<CollectionSchema> = {}): CollectionSchema {
  return {
    slug: 'posts',
    fields: [{ name: 'title', type: 'text', required: true, path: 'title' }],
    relationships: [],
    requiredFields: ['title'],
    populatable: true,
    ...overrides,
  }
}

describe('buildGenerationPrompt — legacy behavior preserved', () => {
  it('keeps "ecommerce platform" framing when domain is not specified', () => {
    const prompt = buildGenerationPrompt(baseSchema(), { count: 3 })
    expect(prompt).toContain('appropriate for an ecommerce platform')
  })

  it('still marks blocks as SKIP when includeBlocks is false (default)', () => {
    const schema = baseSchema({
      fields: [
        { name: 'title', type: 'text', required: true, path: 'title' },
        {
          name: 'layout',
          type: 'blocks',
          required: false,
          path: 'layout',
          blocks: [{ slug: 'hero', fields: [] }],
        },
      ],
    })
    const prompt = buildGenerationPrompt(schema, { count: 1 })
    expect(prompt).toContain('SKIP — complex layout field')
    expect(prompt).not.toContain('blockType')
  })
})

describe('buildGenerationPrompt — new behavior', () => {
  it('drops domain framing when empty string passed', () => {
    const prompt = buildGenerationPrompt(baseSchema(), { count: 1, domain: '' })
    expect(prompt).not.toContain('ecommerce')
    expect(prompt).not.toContain('appropriate for')
    expect(prompt.trimEnd().endsWith('Generate varied, realistic content')).toBe(true)
  })

  it('substitutes custom domain when provided', () => {
    const prompt = buildGenerationPrompt(baseSchema(), { count: 1, domain: 'a news site' })
    expect(prompt).toContain('appropriate for a news site')
    expect(prompt).not.toContain('ecommerce')
  })

  it('includes block catalog when includeBlocks=true', () => {
    const schema = baseSchema({
      fields: [
        {
          name: 'layout',
          type: 'blocks',
          required: true,
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
    })
    const prompt = buildGenerationPrompt(schema, { count: 1, includeBlocks: true })
    expect(prompt).toContain('blockType')
    expect(prompt).toContain('"hero"')
    expect(prompt).toContain('headline (text')
    expect(prompt).not.toContain('SKIP — complex layout field')
  })
})

describe('buildOutputSchema — legacy behavior preserved', () => {
  it('excludes blocks by default', () => {
    const schema = baseSchema({
      fields: [
        { name: 'title', type: 'text', required: true, path: 'title' },
        {
          name: 'layout',
          type: 'blocks',
          required: false,
          path: 'layout',
          blocks: [{ slug: 'hero', fields: [] }],
        },
      ],
    })
    const out = buildOutputSchema(schema) as {
      properties: { items: { items: { properties: Record<string, unknown> } } }
    }
    const itemProps = out.properties.items.items.properties
    expect(itemProps.title).toEqual({ type: 'string' })
    expect(itemProps.layout).toBeUndefined()
  })
})

describe('buildOutputSchema — new behavior', () => {
  it('includes blocks oneOf schema when includeBlocks=true', () => {
    const schema = baseSchema({
      fields: [
        {
          name: 'layout',
          type: 'blocks',
          required: true,
          path: 'layout',
          blocks: [
            { slug: 'hero', fields: [] },
            { slug: 'cta', fields: [] },
          ],
        },
      ],
    })
    const out = buildOutputSchema(schema, { includeBlocks: true }) as {
      properties: {
        items: {
          items: {
            properties: Record<string, { type: string; items: { oneOf: unknown[] } }>
            required: string[]
          }
        }
      }
    }
    const layout = out.properties.items.items.properties.layout
    expect(layout.type).toBe('array')
    expect(layout.items.oneOf).toHaveLength(2)
    expect(out.properties.items.items.required).toContain('layout')
  })
})
