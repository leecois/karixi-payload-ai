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
})
