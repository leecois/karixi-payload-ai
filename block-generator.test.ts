import { describe, expect, it } from 'vitest'
import {
  blocksOutputSchema,
  describeBlocksField,
  validateBlocks,
} from './src/generate/block-generator.js'
import type { FieldSchema } from './src/types.js'

function makeField(blocks: FieldSchema['blocks']): FieldSchema {
  return {
    name: 'layout',
    type: 'blocks',
    required: true,
    path: 'layout',
    blocks,
  }
}

describe('blocksOutputSchema', () => {
  it('returns an array wrapper with oneOf over all blocks', () => {
    const field = makeField([
      {
        slug: 'hero',
        fields: [
          { name: 'headline', type: 'text', required: true, path: 'layout.headline' },
          { name: 'subhead', type: 'text', required: false, path: 'layout.subhead' },
        ],
      },
      {
        slug: 'cta',
        fields: [{ name: 'label', type: 'text', required: true, path: 'layout.label' }],
      },
    ])
    const schema = blocksOutputSchema(field) as {
      type: string
      items: { oneOf: Array<{ properties: Record<string, unknown> }> }
    }
    expect(schema.type).toBe('array')
    expect(schema.items.oneOf).toHaveLength(2)
    expect(schema.items.oneOf[0].properties.blockType).toEqual({ type: 'string', const: 'hero' })
    expect(schema.items.oneOf[0].properties.headline).toEqual({ type: 'string' })
  })

  it('handles select/number/date/checkbox sub-fields correctly', () => {
    const field = makeField([
      {
        slug: 'pricing',
        fields: [
          { name: 'price', type: 'number', required: true, path: 'layout.price' },
          { name: 'active', type: 'checkbox', required: false, path: 'layout.active' },
          { name: 'startsAt', type: 'date', required: false, path: 'layout.startsAt' },
          {
            name: 'tier',
            type: 'select',
            required: false,
            path: 'layout.tier',
            options: [
              { label: 'Basic', value: 'basic' },
              { label: 'Pro', value: 'pro' },
            ],
          },
        ],
      },
    ])
    const schema = blocksOutputSchema(field) as {
      items: { oneOf: Array<{ properties: Record<string, Record<string, unknown>> }> }
    }
    const props = schema.items.oneOf[0].properties
    expect(props.price).toEqual({ type: 'number' })
    expect(props.active).toEqual({ type: 'boolean' })
    expect(props.startsAt).toEqual({ type: 'string', format: 'date-time' })
    expect(props.tier).toEqual({ type: 'string', enum: ['basic', 'pro'] })
  })

  it('returns empty-catalog shape when no blocks defined', () => {
    const field = makeField([])
    const schema = blocksOutputSchema(field)
    expect(schema).toEqual({ type: 'array', items: {} })
  })
})

describe('describeBlocksField', () => {
  it('lists all available block types with slug and fields', () => {
    const field = makeField([
      {
        slug: 'hero',
        label: 'Hero Section',
        fields: [
          { name: 'headline', type: 'text', required: true, path: 'layout.headline' },
          { name: 'image', type: 'upload', required: false, path: 'layout.image' },
        ],
        requiredFields: ['headline'],
      },
    ])
    const out = describeBlocksField(field)
    expect(out).toContain('blockType')
    expect(out).toContain('"hero"')
    expect(out).toContain('Hero Section')
    expect(out).toContain('headline (text')
    expect(out).toContain('image (upload')
    expect(out).toContain('required: headline')
  })

  it('handles empty catalog gracefully', () => {
    const field = makeField([])
    const out = describeBlocksField(field)
    expect(out).toContain('empty block catalog')
  })
})

describe('validateBlocks', () => {
  const field = makeField([
    {
      slug: 'hero',
      fields: [
        { name: 'headline', type: 'text', required: true, path: 'layout.headline' },
        { name: 'subhead', type: 'text', required: false, path: 'layout.subhead' },
      ],
      requiredFields: ['headline'],
    },
    {
      slug: 'cta',
      fields: [{ name: 'label', type: 'text', required: true, path: 'layout.label' }],
      requiredFields: ['label'],
    },
  ])

  it('accepts valid blocks', () => {
    const { valid, issues } = validateBlocks(
      [
        { blockType: 'hero', headline: 'Welcome' },
        { blockType: 'cta', label: 'Sign up' },
      ],
      field,
    )
    expect(valid).toHaveLength(2)
    expect(issues).toHaveLength(0)
  })

  it('drops blocks with unknown blockType and reports it', () => {
    const { valid, issues } = validateBlocks(
      [
        { blockType: 'hero', headline: 'ok' },
        { blockType: 'mystery', foo: 'bar' },
      ],
      field,
    )
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('unknown blockType')
    expect(issues[0].message).toContain('mystery')
  })

  it('drops blocks missing required fields and reports them', () => {
    const { valid, issues } = validateBlocks(
      [
        { blockType: 'hero' }, // missing headline
        { blockType: 'cta', label: '' }, // empty label
      ],
      field,
    )
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(2)
    expect(issues[0].message).toContain('missing required')
  })

  it('reports missing blockType discriminator', () => {
    const { valid, issues } = validateBlocks([{ headline: 'orphan' }], field)
    expect(valid).toHaveLength(0)
    expect(issues[0].message).toContain('missing blockType')
  })

  it('returns empty results for undefined/null input (optional field)', () => {
    const a = validateBlocks(undefined, field)
    const b = validateBlocks(null, field)
    expect(a.valid).toEqual([])
    expect(a.issues).toEqual([])
    expect(b.valid).toEqual([])
    expect(b.issues).toEqual([])
  })

  it('rejects non-array value', () => {
    const { valid, issues } = validateBlocks({ not: 'array' }, field)
    expect(valid).toEqual([])
    expect(issues[0].message).toContain('expected array')
  })

  it('rejects primitive block items', () => {
    const { valid, issues } = validateBlocks(['not an object'], field)
    expect(valid).toHaveLength(0)
    expect(issues[0].message).toContain('block must be an object')
  })
})
