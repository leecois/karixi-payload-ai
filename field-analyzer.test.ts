import { describe, expect, it } from 'vitest'
import { analyzeFields } from './src/core/field-analyzer.js'

describe('analyzeFields', () => {
  it('returns empty array for empty fields', () => {
    expect(analyzeFields([])).toEqual([])
  })

  it('analyzes a text field', () => {
    const fields = [{ type: 'text', name: 'title' }] as any
    const result = analyzeFields(fields)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ name: 'title', type: 'text', path: 'title', required: false })
  })

  it('marks required fields', () => {
    const fields = [{ type: 'text', name: 'title', required: true }] as any
    const result = analyzeFields(fields)
    expect(result[0].required).toBe(true)
  })

  it('skips UI fields', () => {
    const fields = [
      { type: 'ui', name: 'divider' },
      { type: 'text', name: 'title' },
    ] as any
    const result = analyzeFields(fields)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('title')
  })

  it('analyzes select field with string options', () => {
    const fields = [{ type: 'select', name: 'status', options: ['draft', 'published'] }] as any
    const result = analyzeFields(fields)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('select')
    expect(result[0].options).toEqual([
      { label: 'draft', value: 'draft' },
      { label: 'published', value: 'published' },
    ])
  })

  it('analyzes select field with object options', () => {
    const fields = [
      {
        type: 'select',
        name: 'status',
        options: [
          { label: 'Draft', value: 'draft' },
          { label: 'Published', value: 'published' },
        ],
      },
    ] as any
    const result = analyzeFields(fields)
    expect(result[0].options).toEqual([
      { label: 'Draft', value: 'draft' },
      { label: 'Published', value: 'published' },
    ])
  })

  it('analyzes select with hasMany', () => {
    const fields = [{ type: 'select', name: 'tags', options: ['a', 'b'], hasMany: true }] as any
    const result = analyzeFields(fields)
    expect(result[0].hasMany).toBe(true)
  })

  it('analyzes relationship field', () => {
    const fields = [
      { type: 'relationship', name: 'author', relationTo: 'users', hasMany: false },
    ] as any
    const result = analyzeFields(fields)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      hasMany: false,
    })
  })

  it('analyzes relationship field with hasMany', () => {
    const fields = [
      { type: 'relationship', name: 'tags', relationTo: ['tags', 'categories'], hasMany: true },
    ] as any
    const result = analyzeFields(fields)
    expect(result[0].hasMany).toBe(true)
    expect(result[0].relationTo).toEqual(['tags', 'categories'])
  })

  it('uses parentPath prefix in path', () => {
    const fields = [{ type: 'text', name: 'title' }] as any
    const result = analyzeFields(fields, 'meta')
    expect(result[0].path).toBe('meta.title')
  })

  it('analyzes nested group fields', () => {
    const fields = [
      {
        type: 'group',
        name: 'meta',
        fields: [
          { type: 'text', name: 'description' },
          { type: 'text', name: 'keywords' },
        ],
      },
    ] as any
    const result = analyzeFields(fields)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('group')
    expect(result[0].fields).toHaveLength(2)
    expect(result[0].fields?.[0].path).toBe('meta.description')
    expect(result[0].fields?.[1].path).toBe('meta.keywords')
  })

  it('flattens row fields transparently', () => {
    const fields = [
      {
        type: 'row',
        fields: [
          { type: 'text', name: 'firstName' },
          { type: 'text', name: 'lastName' },
        ],
      },
    ] as any
    const result = analyzeFields(fields)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('firstName')
    expect(result[1].name).toBe('lastName')
  })

  it('analyzes richText field', () => {
    const fields = [{ type: 'richText', name: 'content', editor: {} }] as any
    const result = analyzeFields(fields)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('richText')
  })

  it('analyzes array field with subfields', () => {
    const fields = [
      {
        type: 'array',
        name: 'items',
        fields: [{ type: 'text', name: 'label' }],
      },
    ] as any
    const result = analyzeFields(fields)
    expect(result[0].type).toBe('array')
    expect(result[0].fields?.[0].name).toBe('label')
    expect(result[0].fields?.[0].path).toBe('items.label')
  })

  it('extracts admin.description into metadata', () => {
    const fields = [
      { type: 'text', name: 'title', admin: { description: 'The display title' } },
    ] as any
    const result = analyzeFields(fields)
    expect(result[0].metadata?.description).toBe('The display title')
  })

  it('extracts minLength/maxLength into metadata', () => {
    const fields = [{ type: 'text', name: 'slug', minLength: 3, maxLength: 80 }] as any
    const result = analyzeFields(fields)
    expect(result[0].metadata?.minLength).toBe(3)
    expect(result[0].metadata?.maxLength).toBe(80)
  })

  it('extracts numeric min/max into metadata', () => {
    const fields = [{ type: 'number', name: 'price', min: 0, max: 999 }] as any
    const result = analyzeFields(fields)
    expect(result[0].metadata?.min).toBe(0)
    expect(result[0].metadata?.max).toBe(999)
  })

  it('extracts defaultValue into metadata (skipping functions)', () => {
    const fields = [
      { type: 'text', name: 'status', defaultValue: 'draft' },
      { type: 'text', name: 'dynamic', defaultValue: () => 'x' },
    ] as any
    const result = analyzeFields(fields)
    expect(result[0].metadata?.defaultValue).toBe('draft')
    expect(result[1].metadata?.defaultValue).toBeUndefined()
  })

  it('extracts admin.custom.aiHint into metadata', () => {
    const fields = [
      {
        type: 'text',
        name: 'headline',
        admin: { custom: { aiHint: 'Catchy SEO-friendly headline, 50-70 chars' } },
      },
    ] as any
    const result = analyzeFields(fields)
    expect(result[0].metadata?.aiHint).toBe('Catchy SEO-friendly headline, 50-70 chars')
  })

  it('picks first string from localized label object for description', () => {
    const fields = [
      { type: 'text', name: 'title', admin: { description: { en: 'English desc', fr: 'desc fr' } } },
    ] as any
    const result = analyzeFields(fields)
    expect(result[0].metadata?.description).toBe('English desc')
  })

  it('omits metadata entirely when nothing is present', () => {
    const fields = [{ type: 'text', name: 'title' }] as any
    const result = analyzeFields(fields)
    expect(result[0].metadata).toBeUndefined()
  })

  it('analyzes blocks field with block schemas', () => {
    const fields = [
      {
        type: 'blocks',
        name: 'layout',
        blocks: [
          {
            slug: 'hero',
            labels: { singular: 'Hero Section' },
            imageAltText: 'Banner',
            fields: [
              { type: 'text', name: 'headline', required: true },
              { type: 'text', name: 'subhead' },
            ],
          },
          {
            slug: 'cta',
            fields: [{ type: 'text', name: 'label', required: true }],
          },
        ],
      },
    ] as any
    const result = analyzeFields(fields)
    expect(result[0].type).toBe('blocks')
    expect(result[0].blocks).toHaveLength(2)
    const hero = result[0].blocks?.[0]
    expect(hero?.slug).toBe('hero')
    expect(hero?.label).toBe('Hero Section')
    expect(hero?.imageAltText).toBe('Banner')
    expect(hero?.requiredFields).toEqual(['headline'])
    expect(hero?.fields[0].path).toBe('layout.headline')
    expect(result[0].blocks?.[1].slug).toBe('cta')
  })
})
