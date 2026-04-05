import { describe, expect, it } from 'vitest'
import { getDependencies, resolveCreationOrder } from './src/core/dependency-resolver.js'
import type { CollectionSchema } from './src/types.js'

function makeSchema(
  slug: string,
  relationships: CollectionSchema['relationships'] = [],
): CollectionSchema {
  return {
    slug,
    fields: [],
    relationships,
    requiredFields: [],
    populatable: true,
  }
}

describe('getDependencies', () => {
  it('returns empty array when no relationships', () => {
    const schema = makeSchema('posts')
    expect(getDependencies(schema)).toEqual([])
  })

  it('returns dependency slugs from relationships', () => {
    const schema = makeSchema('posts', [
      { field: 'author', collection: 'users', hasMany: false, isSelfReferential: false },
      { field: 'category', collection: 'categories', hasMany: false, isSelfReferential: false },
    ])
    const deps = getDependencies(schema)
    expect(deps).toContain('users')
    expect(deps).toContain('categories')
    expect(deps).toHaveLength(2)
  })

  it('excludes self-referential relationships', () => {
    const schema = makeSchema('categories', [
      { field: 'parent', collection: 'categories', hasMany: false, isSelfReferential: true },
    ])
    expect(getDependencies(schema)).toEqual([])
  })

  it('handles array relationship targets', () => {
    const schema = makeSchema('posts', [
      {
        field: 'related',
        collection: ['articles', 'pages'],
        hasMany: true,
        isSelfReferential: false,
      },
    ])
    const deps = getDependencies(schema)
    expect(deps).toContain('articles')
    expect(deps).toContain('pages')
  })

  it('excludes self-slug from array targets', () => {
    const schema = makeSchema('posts', [
      { field: 'related', collection: ['posts', 'pages'], hasMany: true, isSelfReferential: false },
    ])
    const deps = getDependencies(schema)
    expect(deps).not.toContain('posts')
    expect(deps).toContain('pages')
  })
})

describe('resolveCreationOrder', () => {
  it('returns single schema with no deps', () => {
    const schemas = [makeSchema('users')]
    expect(resolveCreationOrder(schemas)).toEqual(['users'])
  })

  it('places dependency before dependent (linear)', () => {
    const schemas = [
      makeSchema('posts', [
        { field: 'author', collection: 'users', hasMany: false, isSelfReferential: false },
      ]),
      makeSchema('users'),
    ]
    const order = resolveCreationOrder(schemas)
    expect(order.indexOf('users')).toBeLessThan(order.indexOf('posts'))
  })

  it('handles multi-level dependencies', () => {
    const schemas = [
      makeSchema('comments', [
        { field: 'post', collection: 'posts', hasMany: false, isSelfReferential: false },
      ]),
      makeSchema('posts', [
        { field: 'author', collection: 'users', hasMany: false, isSelfReferential: false },
      ]),
      makeSchema('users'),
    ]
    const order = resolveCreationOrder(schemas)
    expect(order.indexOf('users')).toBeLessThan(order.indexOf('posts'))
    expect(order.indexOf('posts')).toBeLessThan(order.indexOf('comments'))
  })

  it('handles schemas with no interdependencies', () => {
    const schemas = [makeSchema('users'), makeSchema('categories'), makeSchema('tags')]
    const order = resolveCreationOrder(schemas)
    expect(order).toHaveLength(3)
    expect(order).toContain('users')
    expect(order).toContain('categories')
    expect(order).toContain('tags')
  })

  it('ignores self-referential dependencies when ordering', () => {
    const schemas = [
      makeSchema('categories', [
        { field: 'parent', collection: 'categories', hasMany: false, isSelfReferential: true },
      ]),
      makeSchema('posts', [
        { field: 'category', collection: 'categories', hasMany: false, isSelfReferential: false },
      ]),
    ]
    const order = resolveCreationOrder(schemas)
    expect(order.indexOf('categories')).toBeLessThan(order.indexOf('posts'))
  })

  it('handles circular dependencies by appending remaining schemas', () => {
    const schemas = [
      makeSchema('a', [{ field: 'b', collection: 'b', hasMany: false, isSelfReferential: false }]),
      makeSchema('b', [{ field: 'a', collection: 'a', hasMany: false, isSelfReferential: false }]),
    ]
    const order = resolveCreationOrder(schemas)
    expect(order).toHaveLength(2)
    expect(order).toContain('a')
    expect(order).toContain('b')
  })
})
