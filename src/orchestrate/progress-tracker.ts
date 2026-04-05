import { EventEmitter } from 'node:events'
import type { ProgressEvent } from '../types.js'

/** Create a typed EventEmitter for progress events */
export function createProgressEmitter(): EventEmitter {
  return new EventEmitter()
}

/** Emit a progress event on the emitter */
export function emitProgress(emitter: EventEmitter, event: ProgressEvent): void {
  emitter.emit('progress', event)
}
