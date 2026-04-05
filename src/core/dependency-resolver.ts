import type { CollectionSchema } from '../types.js'

/**
 * Returns the direct dependency slugs for a collection schema.
 * Dependencies are collections that must be created before this one.
 * Self-referential relationships are excluded (handled via deferred updates).
 */
export function getDependencies(schema: CollectionSchema): string[] {
  const deps = new Set<string>()

  for (const rel of schema.relationships) {
    if (rel.isSelfReferential) continue

    const targets = Array.isArray(rel.collection) ? rel.collection : [rel.collection]
    for (const target of targets) {
      if (target !== schema.slug) {
        deps.add(target)
      }
    }
  }

  return [...deps]
}

/**
 * Topologically sorts collection schemas using Kahn's algorithm.
 * Returns slugs in creation order (dependencies first).
 * Circular dependencies (excluding self-referential) are broken arbitrarily
 * and a warning is emitted.
 */
export function resolveCreationOrder(schemas: CollectionSchema[]): string[] {
  const slugSet = new Set(schemas.map((s) => s.slug))

  // Build adjacency list: slug → set of slugs it depends on (that are in our schema set)
  const deps = new Map<string, Set<string>>()
  // Reverse: slug → set of slugs that depend on it
  const dependents = new Map<string, Set<string>>()

  for (const schema of schemas) {
    if (!deps.has(schema.slug)) deps.set(schema.slug, new Set())
    if (!dependents.has(schema.slug)) dependents.set(schema.slug, new Set())

    for (const dep of getDependencies(schema)) {
      // Only track dependencies within the provided schema set
      if (!slugSet.has(dep)) continue
      deps.get(schema.slug)?.add(dep)

      if (!dependents.has(dep)) dependents.set(dep, new Set())
      dependents.get(dep)?.add(schema.slug)
    }
  }

  // Kahn's algorithm
  const inDegree = new Map<string, number>()
  for (const schema of schemas) {
    inDegree.set(schema.slug, deps.get(schema.slug)?.size ?? 0)
  }

  const queue: string[] = []
  for (const [slug, degree] of inDegree) {
    if (degree === 0) queue.push(slug)
  }
  // Sort for deterministic output
  queue.sort()

  const order: string[] = []

  while (queue.length > 0) {
    // Sort queue for determinism each iteration
    queue.sort()
    const slug = queue.shift()!
    order.push(slug)

    for (const dependent of dependents.get(slug) ?? []) {
      const newDegree = (inDegree.get(dependent) ?? 1) - 1
      inDegree.set(dependent, newDegree)
      if (newDegree === 0) {
        queue.push(dependent)
      }
    }
  }

  // If we didn't include everything, there are circular dependencies
  if (order.length < schemas.length) {
    const remaining = schemas.map((s) => s.slug).filter((s) => !order.includes(s))
    console.warn(
      `[dependency-resolver] Circular dependency detected among: ${remaining.join(', ')}. ` +
        'These will be appended in arbitrary order.',
    )
    order.push(...remaining.sort())
  }

  return order
}
