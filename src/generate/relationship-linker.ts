import type { Payload, PayloadRequest } from 'payload'
import type { CollectionSchema } from '../types.js'

export type LinkRelationshipsOptions = {
  /**
   * Optional: a deterministic seeded RNG. Pass a Math.random-compatible
   * function to make relationship picks reproducible (tests, dry-runs).
   */
  rng?: () => number
  /**
   * Per-document semantic similarity scorer. Given a source document and
   * a candidate target document, return a score in [0,1]. Higher wins.
   * Used to prefer semantically-matched relationships over random picks.
   */
  scoreMatch?: (source: Record<string, unknown>, candidate: Record<string, unknown>) => number
  /**
   * Optional: map of collection slug -> full document payloads (indexed by
   * doc id). When supplied, the linker uses scoreMatch to prefer
   * semantically-matched candidates instead of picking at random.
   */
  documents?: Record<string, Record<string, Record<string, unknown>>>
}

/**
 * Deterministic Fisher-Yates shuffle using the supplied rng.
 */
function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

/**
 * Default scorer: lightweight token overlap on string fields — prefers
 * targets whose string values share tokens with the source document.
 * Returns 0 for totally unrelated docs so we don't over-weight arbitrary pairs.
 */
function defaultScoreMatch(
  source: Record<string, unknown>,
  candidate: Record<string, unknown>,
): number {
  const tokens = (v: unknown): Set<string> => {
    if (typeof v !== 'string') return new Set()
    return new Set(
      v
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 2),
    )
  }

  const src = new Set<string>()
  for (const val of Object.values(source)) for (const t of tokens(val)) src.add(t)
  if (src.size === 0) return 0

  const cand = new Set<string>()
  for (const val of Object.values(candidate)) for (const t of tokens(val)) cand.add(t)
  if (cand.size === 0) return 0

  let shared = 0
  for (const t of src) if (cand.has(t)) shared++
  // Dice coefficient
  return (2 * shared) / (src.size + cand.size)
}

/**
 * Link relationship fields between generated documents.
 *
 * For each relationship defined in the schema, looks up available IDs
 * from documentIds and updates the documents in that collection.
 *
 * When `options.scoreMatch` is provided (defaults to token-overlap), the
 * linker prefers semantically-matched candidates over random picks. Falls
 * back to random if no targets share tokens (score = 0 for all).
 */
export async function linkRelationships(
  payload: Payload,
  req: PayloadRequest,
  schema: CollectionSchema,
  documentIds: Record<string, string[]>,
  options: LinkRelationshipsOptions = {},
): Promise<{ updated: number; failed: number }> {
  const rng = options.rng ?? Math.random
  const scoreMatch = options.scoreMatch ?? defaultScoreMatch
  let updated = 0
  let failed = 0

  const ownIds = documentIds[schema.slug] ?? []
  if (ownIds.length === 0) return { updated, failed }

  /** Rank candidate target IDs by semantic score relative to source. */
  const rankCandidates = (
    sourceCollection: string,
    sourceId: string,
    targetCollection: string,
    targetIds: string[],
  ) => {
    const srcDoc = options.documents?.[sourceCollection]?.[sourceId]
    if (!srcDoc) return shuffle(targetIds, rng)
    const scored = targetIds.map((id) => {
      const targetDoc = options.documents?.[targetCollection]?.[id]
      const score = targetDoc ? scoreMatch(srcDoc, targetDoc) : 0
      return { id, score }
    })
    // Sort by score desc, break ties with shuffle for variance
    scored.sort((a, b) => b.score - a.score)
    const bestScore = scored[0]?.score ?? 0
    if (bestScore === 0) return shuffle(targetIds, rng)
    return scored.map((s) => s.id)
  }

  for (const docId of ownIds) {
    const updateData: Record<string, unknown> = {}
    let hasUpdates = false

    for (const rel of schema.relationships) {
      const targetCollection = Array.isArray(rel.collection) ? rel.collection[0] : rel.collection

      if (!targetCollection) continue

      // Self-referential: assign 2–4 sibling IDs (excluding self)
      if (rel.isSelfReferential) {
        const siblings = ownIds.filter((id) => id !== docId)
        if (siblings.length === 0) continue

        const count = Math.min(siblings.length, 2 + Math.floor(rng() * 3))
        const ranked = rankCandidates(schema.slug, docId, schema.slug, siblings)
        const picked = ranked.slice(0, count)

        updateData[rel.field] = rel.hasMany ? picked : picked[0]
        hasUpdates = true
        continue
      }

      const targetIds = documentIds[targetCollection] ?? []
      if (targetIds.length === 0) continue

      const ranked = rankCandidates(schema.slug, docId, targetCollection, targetIds)

      if (rel.hasMany) {
        // Pick up to 3, preferring top-scored matches
        const count = Math.min(targetIds.length, 1 + Math.floor(rng() * 3))
        updateData[rel.field] = ranked.slice(0, count)
      } else {
        // Pick the top-scored match
        updateData[rel.field] = ranked[0]
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
