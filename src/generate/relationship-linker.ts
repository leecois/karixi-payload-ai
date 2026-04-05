import type { Payload, PayloadRequest } from 'payload'
import type { CollectionSchema } from '../types.js'

/**
 * Link relationship fields between generated documents.
 *
 * For each relationship defined in the schema, looks up available IDs
 * from documentIds and updates the documents in that collection.
 */
export async function linkRelationships(
  payload: Payload,
  req: PayloadRequest,
  schema: CollectionSchema,
  documentIds: Record<string, string[]>,
): Promise<{ updated: number; failed: number }> {
  let updated = 0
  let failed = 0

  const ownIds = documentIds[schema.slug] ?? []
  if (ownIds.length === 0) return { updated, failed }

  for (const docId of ownIds) {
    const updateData: Record<string, unknown> = {}
    let hasUpdates = false

    for (const rel of schema.relationships) {
      const targetCollection = Array.isArray(rel.collection) ? rel.collection[0] : rel.collection

      if (!targetCollection) continue

      // Self-referential: assign 2–4 random sibling IDs (excluding self)
      if (rel.isSelfReferential) {
        const siblings = ownIds.filter((id) => id !== docId)
        if (siblings.length === 0) continue

        const count = Math.min(siblings.length, 2 + Math.floor(Math.random() * 3))
        const shuffled = [...siblings].sort(() => Math.random() - 0.5).slice(0, count)

        updateData[rel.field] = rel.hasMany ? shuffled : shuffled[0]
        hasUpdates = true
        continue
      }

      const targetIds = documentIds[targetCollection] ?? []
      if (targetIds.length === 0) continue

      if (rel.hasMany) {
        // Pick up to 3 random IDs
        const count = Math.min(targetIds.length, 1 + Math.floor(Math.random() * 3))
        const shuffled = [...targetIds].sort(() => Math.random() - 0.5).slice(0, count)
        updateData[rel.field] = shuffled
      } else {
        // Pick a single random ID
        const randomIndex = Math.floor(Math.random() * targetIds.length)
        updateData[rel.field] = targetIds[randomIndex]
      }

      hasUpdates = true
    }

    if (!hasUpdates) continue

    try {
      await payload.update({
        collection: schema.slug as Parameters<Payload['update']>[0]['collection'],
        id: docId,
        data: updateData,
        overrideAccess: true,
        req,
      })
      updated++
    } catch (err) {
      console.error(
        `[relationship-linker] Failed to update ${schema.slug}/${docId}:`,
        err instanceof Error ? err.message : String(err),
      )
      failed++
    }
  }

  return { updated, failed }
}
