import { describe, expect, it } from 'vitest'
import { readAllCollectionSchemas, readCollectionSchema } from './src/core/schema-reader.js'

function fakePayload(slugs: Array<{ slug: string; fields?: unknown[] }>) {
  const map: Record<string, { config: unknown }> = {}
  for (const s of slugs) {
    map[s.slug] = { config: { slug: s.slug, fields: s.fields ?? [] } }
  }
  return { collections: map } as never
}

describe('readCollectionSchema — nonPopulatable defaults', () => {
  it('marks ecommerce defaults (orders/carts/transactions) as non-populatable by default', () => {
    const p = fakePayload([
      { slug: 'posts' },
      { slug: 'orders' },
      { slug: 'carts' },
      { slug: 'transactions' },
    ])
    expect(readCollectionSchema(p, 'posts').populatable).toBe(true)
    expect(readCollectionSchema(p, 'orders').populatable).toBe(false)
    expect(readCollectionSchema(p, 'carts').populatable).toBe(false)
    expect(readCollectionSchema(p, 'transactions').populatable).toBe(false)
  })

  it('merges extra nonPopulatableSlugs with defaults', () => {
    const p = fakePayload([{ slug: 'posts' }, { slug: 'invoices' }, { slug: 'orders' }])
    const schemas = readAllCollectionSchemas(p, { nonPopulatableSlugs: ['invoices'] })
    const byslug = Object.fromEntries(schemas.map((s) => [s.slug, s.populatable]))
    expect(byslug.posts).toBe(true)
    expect(byslug.invoices).toBe(false)
    expect(byslug.orders).toBe(false) // default still applies
  })

  it('replaceDefaults drops the built-in defaults entirely', () => {
    const p = fakePayload([{ slug: 'orders' }, { slug: 'posts' }])
    const schemas = readAllCollectionSchemas(p, {
      nonPopulatableSlugs: ['posts'],
      replaceDefaults: true,
    })
    const byslug = Object.fromEntries(schemas.map((s) => [s.slug, s.populatable]))
    expect(byslug.orders).toBe(true) // default no longer applied
    expect(byslug.posts).toBe(false) // user override applies
  })

  it('replaceDefaults with no overrides makes everything populatable', () => {
    const p = fakePayload([{ slug: 'orders' }, { slug: 'carts' }])
    const schemas = readAllCollectionSchemas(p, { replaceDefaults: true })
    for (const s of schemas) expect(s.populatable).toBe(true)
  })

  it('throws for unknown collection slug', () => {
    const p = fakePayload([{ slug: 'posts' }])
    expect(() => readCollectionSchema(p, 'nonexistent')).toThrow(/not found/)
  })
})
