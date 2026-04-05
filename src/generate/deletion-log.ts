import type { Payload, PayloadRequest } from 'payload'
import type { DeletionLogEntry } from '../types.js'

/**
 * Tracks created documents for rollback on failure.
 * Uses in-memory journal — no MongoDB transaction dependency.
 * Works on standalone MongoDB, replica sets, and Atlas.
 */
export class DeletionLog {
  private journal: DeletionLogEntry[] = []

  /** Record a created document for potential rollback */
  record(collection: string, id: string): void {
    this.journal.push({ collection, id, createdAt: new Date() })
  }

  /** Get all recorded entries */
  getEntries(): readonly DeletionLogEntry[] {
    return [...this.journal]
  }

  /** Get count of recorded entries */
  get size(): number {
    return this.journal.length
  }

  /**
   * Rollback all created documents by deleting them in reverse order.
   * Best-effort: if process crashes, journal is lost.
   */
  async rollback(
    payload: Payload,
    req: PayloadRequest,
  ): Promise<{
    deleted: number
    failed: Array<{ collection: string; id: string; error: string }>
  }> {
    const failed: Array<{ collection: string; id: string; error: string }> = []
    let deleted = 0

    // Delete in reverse order (most recent first)
    for (const entry of [...this.journal].reverse()) {
      try {
        await payload.delete({
          collection: entry.collection as Parameters<Payload['delete']>[0]['collection'],
          id: entry.id,
          req,
        })
        deleted++
      } catch (err) {
        failed.push({
          collection: entry.collection,
          id: entry.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    this.journal = []
    return { deleted, failed }
  }

  /** Clear the journal without deleting documents */
  clear(): void {
    this.journal = []
  }
}
