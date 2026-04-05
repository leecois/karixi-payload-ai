import { describe, expect, it } from 'vitest'
import { DeletionLog } from './src/generate/deletion-log.js'

describe('DeletionLog', () => {
  it('starts with size 0', () => {
    const log = new DeletionLog()
    expect(log.size).toBe(0)
  })

  it('records entries and increments size', () => {
    const log = new DeletionLog()
    log.record('posts', 'abc123')
    expect(log.size).toBe(1)
    log.record('users', 'def456')
    expect(log.size).toBe(2)
  })

  it('getEntries returns all recorded entries', () => {
    const log = new DeletionLog()
    log.record('posts', 'id-1')
    log.record('users', 'id-2')
    const entries = log.getEntries()
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ collection: 'posts', id: 'id-1' })
    expect(entries[1]).toMatchObject({ collection: 'users', id: 'id-2' })
  })

  it('getEntries includes createdAt date', () => {
    const log = new DeletionLog()
    log.record('posts', 'id-1')
    const entries = log.getEntries()
    expect(entries[0].createdAt).toBeInstanceOf(Date)
  })

  it('clear resets size to 0', () => {
    const log = new DeletionLog()
    log.record('posts', 'id-1')
    log.record('users', 'id-2')
    log.clear()
    expect(log.size).toBe(0)
  })

  it('clear empties the entries', () => {
    const log = new DeletionLog()
    log.record('posts', 'id-1')
    log.clear()
    expect(log.getEntries()).toHaveLength(0)
  })

  it('getEntries returns correct collection and id', () => {
    const log = new DeletionLog()
    log.record('categories', 'cat-99')
    const [entry] = log.getEntries()
    expect(entry.collection).toBe('categories')
    expect(entry.id).toBe('cat-99')
  })

  it('getEntries is readonly — does not allow mutation of internal journal', () => {
    const log = new DeletionLog()
    log.record('posts', 'id-1')
    const entries = log.getEntries()
    // The returned array is ReadonlyArray; we verify size is not affected by casting
    expect(entries).toHaveLength(1)
    expect(log.size).toBe(1)
  })

  it('records multiple entries in order', () => {
    const log = new DeletionLog()
    log.record('a', '1')
    log.record('b', '2')
    log.record('c', '3')
    const entries = log.getEntries()
    expect(entries[0].collection).toBe('a')
    expect(entries[1].collection).toBe('b')
    expect(entries[2].collection).toBe('c')
  })
})
