import type { EventEmitter } from 'node:events'
import type { Payload, PayloadRequest } from 'payload'
import type { FieldAdapterRegistry } from '../core/field-adapters.js'
import { DeletionLog } from '../generate/deletion-log.js'
import { linkRelationships } from '../generate/relationship-linker.js'
import type { AIProvider, CollectionSchema, ProgressEvent } from '../types.js'
import { createLimiter } from './concurrency.js'
import { emitProgress } from './progress-tracker.js'

export type BulkRunConfig = {
  theme: string
  counts: Record<string, number>
  provider: AIProvider
  rollbackOnError?: boolean
  mediaSource?: 'unsplash' | 'placeholder'
  /** Forwarded to GenerationContext.domain — replaces default ecommerce framing */
  domain?: string
  /** Forwarded to GenerationContext.includeBlocks — enables first-class Blocks support */
  includeBlocks?: boolean
  /** Max concurrent payload.create() calls per collection. Default: 1 (serial). */
  maxConcurrentCreates?: number
  /** Minimum ms between dispatches within a collection. Default: 0. */
  delayBetweenCreatesMs?: number
  /** Optional FieldTypeAdapter registry for custom field types */
  adapters?: FieldAdapterRegistry
}

export type BulkRunResult = {
  created: Record<string, number>
  failed: Record<string, number>
  documentIds: Record<string, string[]>
  rolledBack: boolean
  elapsed: number
}

/**
 * Run bulk population of Payload collections in dependency order.
 *
 * Flow:
 * 1. Resolve creation order from schemas
 * 2. Filter to collections requested in config.counts
 * 3. For each collection: generate documents, create them, record in deletion log
 * 4. After all: link deferred relationships
 * 5. On error + rollbackOnError: rollback all created documents
 */
export async function runBulkPopulation(
  payload: Payload,
  req: PayloadRequest,
  schemas: CollectionSchema[],
  config: BulkRunConfig,
  emitter?: EventEmitter,
): Promise<BulkRunResult> {
  const startTime = Date.now()

  // Lazy imports to avoid circular dependency issues at module load time
  const { resolveCreationOrder } = await import('../core/dependency-resolver.js')
  const { generateDocuments } = await import('../core/content-generator.js')

  const created: Record<string, number> = {}
  const failed: Record<string, number> = {}
  const documentIds: Record<string, string[]> = {}
  const documentBodies: Record<string, Record<string, Record<string, unknown>>> = {}
  const deletionLog = new DeletionLog()
  let rolledBack = false

  // Determine ordered list of slugs to process
  const orderedSlugs = resolveCreationOrder(schemas)
  const slugsToProcess = orderedSlugs.filter(
    (slug) => slug in config.counts && config.counts[slug] > 0,
  )

  const schemaMap = new Map(schemas.map((s) => [s.slug, s]))

  try {
    for (const slug of slugsToProcess) {
      const schema = schemaMap.get(slug)
      if (!schema) continue

      const count = config.counts[slug] ?? 0
      created[slug] = 0
      failed[slug] = 0
      documentIds[slug] = []

      let generatedDocs: Record<string, unknown>[]
      try {
        const result = await generateDocuments(config.provider, schema, {
          count,
          theme: config.theme,
          existingIds: documentIds,
          ...(config.domain !== undefined ? { domain: config.domain } : {}),
          ...(config.includeBlocks !== undefined ? { includeBlocks: config.includeBlocks } : {}),
          ...(config.adapters ? { adapters: config.adapters } : {}),
        })
        generatedDocs = result.documents
      } catch (err) {
        console.error(
          `[bulk-runner] Failed to generate documents for "${slug}":`,
          err instanceof Error ? err.message : String(err),
        )
        failed[slug] = count
        continue
      }

      const limiter = createLimiter({
        concurrency: config.maxConcurrentCreates ?? 1,
        delayBetweenMs: config.delayBetweenCreatesMs ?? 0,
      })

      await Promise.all(
        generatedDocs.map((doc) =>
          limiter(async () => {
            try {
              const record = await payload.create({
                collection: slug as Parameters<Payload['create']>[0]['collection'],
                data: doc as Record<string, unknown>,
                overrideAccess: true,
                req,
              })

              const id = String(record.id)
              deletionLog.record(slug, id)
              documentIds[slug].push(id)
              if (!documentBodies[slug]) documentBodies[slug] = {}
              documentBodies[slug][id] = doc as Record<string, unknown>
              created[slug]++
            } catch (err) {
              console.error(
                `[bulk-runner] Failed to create document in "${slug}":`,
                err instanceof Error ? err.message : String(err),
              )
              failed[slug]++
            }

            if (emitter) {
              const event: ProgressEvent = {
                phase: 'create',
                collection: slug,
                created: created[slug],
                failed: failed[slug],
                total: count,
                elapsed: Date.now() - startTime,
              }
              emitProgress(emitter, event)
            }
          }),
        ),
      )
    }

    // Deferred: link relationships across all processed collections
    for (const slug of slugsToProcess) {
      const schema = schemaMap.get(slug)
      if (!schema || schema.relationships.length === 0) continue

      try {
        await linkRelationships(payload, req, schema, documentIds, {
          documents: documentBodies,
        })
      } catch (err) {
        console.error(
          `[bulk-runner] Failed to link relationships for "${slug}":`,
          err instanceof Error ? err.message : String(err),
        )
      }
    }
  } catch (err) {
    console.error(
      '[bulk-runner] Unexpected error during bulk population:',
      err instanceof Error ? err.message : String(err),
    )

    if (config.rollbackOnError) {
      console.log('[bulk-runner] Rolling back created documents...')
      await deletionLog.rollback(payload, req)
      rolledBack = true
    }
  }

  return {
    created,
    failed,
    documentIds,
    rolledBack,
    elapsed: Date.now() - startTime,
  }
}
