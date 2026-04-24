import { describe, expect, it, vi } from 'vitest'
import { linkRelationships } from './src/generate/relationship-linker.js'
import type { CollectionSchema } from './src/types.js'

/** Minimal payload stub capturing calls to payload.update */
function makePayload() {
  const calls: Array<{ id: string; data: Record<string, unknown> }> = []
  return {
    payload: {
      update: vi.fn(async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
        calls.push({ id, data })
        return { id }
      }),
    } as never,
    req: {} as never,
    calls,
  }
}

const postsSchema: CollectionSchema = {
  slug: 'posts',
  fields: [],
  relationships: [
    { field: 'category', collection: 'categories', hasMany: false, isSelfReferential: false },
  ],
  requiredFields: [],
  populatable: true,
}

describe('linkRelationships — deterministic mode via rng', () => {
  it('is reproducible when same rng seed is passed', async () => {
    const seed = () => 0.25
    const run = async () => {
      const { payload, req, calls } = makePayload()
      await linkRelationships(
        payload,
        req,
        postsSchema,
        { posts: ['p1', 'p2', 'p3'], categories: ['c1', 'c2', 'c3'] },
        { rng: seed },
      )
      return calls
    }
    const a = await run()
    const b = await run()
    expect(a).toEqual(b)
  })
})

describe('linkRelationships — semantic scoring', () => {
  it('prefers candidates that share tokens with the source', async () => {
    const { payload, req, calls } = makePayload()
    await linkRelationships(
      payload,
      req,
      postsSchema,
      { posts: ['p1'], categories: ['c1', 'c2', 'c3'] },
      {
        documents: {
          posts: { p1: { title: 'Sustainable fashion trends for fall' } },
          categories: {
            c1: { name: 'Technology gadgets' },
            c2: { name: 'Sustainable fashion weekly' },
            c3: { name: 'Automotive reviews' },
          },
        },
      },
    )
    expect(calls[0].data.category).toBe('c2')
  })

  it('falls back to random shuffle when no target documents share tokens', async () => {
    const { payload, req, calls } = makePayload()
    const rng = () => 0.99 // near-1 → shuffle deterministically
    await linkRelationships(
      payload,
      req,
      postsSchema,
      { posts: ['p1'], categories: ['c1', 'c2'] },
      {
        rng,
        documents: {
          posts: { p1: { title: 'blue' } },
          categories: {
            c1: { name: 'red' },
            c2: { name: 'green' },
          },
        },
      },
    )
    // Either id is valid — assert SOMETHING was picked, and it's one of them
    expect(['c1', 'c2']).toContain(calls[0].data.category)
  })

  it('handles self-referential relationships semantically', async () => {
    const selfRefSchema: CollectionSchema = {
      slug: 'categories',
      fields: [],
      relationships: [
        { field: 'parent', collection: 'categories', hasMany: false, isSelfReferential: true },
      ],
      requiredFields: [],
      populatable: true,
    }
    const { payload, req, calls } = makePayload()
    await linkRelationships(
      payload,
      req,
      selfRefSchema,
      { categories: ['c1', 'c2', 'c3'] },
      {
        documents: {
          categories: {
            c1: { name: 'Fashion outerwear jackets' },
            c2: { name: 'Fashion menswear' },
            c3: { name: 'Kitchen appliances' },
          },
        },
      },
    )
    // c1 with 'fashion outerwear' should pick c2 (also fashion) over c3 (kitchen)
    const c1Update = calls.find((c) => c.id === 'c1')
    expect(c1Update?.data.parent).toBe('c2')
  })

  it('skips relationships when no target IDs exist', async () => {
    const { payload, req, calls } = makePayload()
    const result = await linkRelationships(payload, req, postsSchema, {
      posts: ['p1'],
      categories: [],
    })
    expect(calls).toHaveLength(0)
    expect(result.updated).toBe(0)
  })
})

describe('linkRelationships — backwards compatibility', () => {
  it('works without options (default random+fallback)', async () => {
    const { payload, req, calls } = makePayload()
    const result = await linkRelationships(payload, req, postsSchema, {
      posts: ['p1', 'p2'],
      categories: ['c1', 'c2'],
    })
    expect(result.updated).toBe(2)
    expect(calls).toHaveLength(2)
    // Each post got a category assigned from available categories
    for (const c of calls) {
      expect(['c1', 'c2']).toContain(c.data.category)
    }
  })
})
