import { describe, expect, it } from 'vitest'
import type { KeyValueStorage } from '../src/draft-store.js'
import { jumpTo, recordSnapshot, startHistory, timeline, type DraftSnapshot, type UndoState } from '../src/undo-history.js'
import { fitUndoStack, readUndoStack, undoKey, writeUndoStack } from '../src/undo-store.js'

function memoryStorage(limit = Number.POSITIVE_INFINITY): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>()
  const size = () => [...map].reduce((sum, [key, value]) => sum + key.length + value.length, 0)
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem(key, value) {
      const before = map.get(key)
      map.set(key, value)
      if (size() > limit) {
        if (before === undefined) map.delete(key)
        else map.set(key, before)
        throw new Error('QuotaExceededError')
      }
    },
    removeItem: (key) => void map.delete(key),
    keys: () => [...map.keys()],
  }
}

const snap = (page: string, site = 's', at?: number): DraftSnapshot => (at === undefined ? { page, site } : { page, site, at })

function stack(slug: string, count: number, pageSize = 10): UndoState {
  let state = startHistory(slug, snap('0'.repeat(pageSize)))
  for (let i = 1; i <= count; i += 1) state = recordSnapshot(state, snap(String(i).padStart(pageSize, 'x'), 's', i))
  return state
}

describe('session undo store', () => {
  it('round-trips a stack with its times, past and future', () => {
    const storage = memoryStorage()
    const state = jumpTo(stack('about', 5), 2)
    writeUndoStack(storage, 'p1', state)
    expect(readUndoStack(storage, 'p1', 'about')).toEqual(state)
    expect(readUndoStack(storage, 'p1', 'other')).toBeNull()
    expect(readUndoStack(storage, 'p2', 'about')).toBeNull()
  })

  it('stores a site value shared by many steps once', () => {
    const storage = memoryStorage()
    const site = 'S'.repeat(10_000)
    let state = startHistory('index', snap('a', site))
    for (let i = 0; i < 50; i += 1) state = recordSnapshot(state, snap(`a${i}`, site))
    writeUndoStack(storage, 'p', state)
    expect(storage.map.get(undoKey('p', 'index'))!.length).toBeLessThan(12_000)
  })

  it('drops the oldest steps to fit the budget and keeps the present', () => {
    const state = stack('index', 100, 1000)
    const { state: fitted, text } = fitUndoStack(state, 20_000)
    expect(text.length).toBeLessThanOrEqual(20_000)
    expect(fitted.present).toEqual(state.present)
    expect(fitted.past.at(-1)).toEqual(state.past.at(-1))
    expect(fitted.past.length).toBeLessThan(state.past.length)
  })

  it('evicts the least recently used page before shrinking this one', () => {
    const storage = memoryStorage(60_000)
    writeUndoStack(storage, 'p', stack('old', 20, 1000))
    writeUndoStack(storage, 'p', stack('new', 40, 1000))
    expect(readUndoStack(storage, 'p', 'old')).toBeNull()
    expect(readUndoStack(storage, 'p', 'new')?.past).toHaveLength(40)
  })

  it('never throws when storage refuses everything', () => {
    const storage = memoryStorage(0)
    expect(() => writeUndoStack(storage, 'p', stack('index', 5))).not.toThrow()
    expect(readUndoStack(storage, 'p', 'index')).toBeNull()
  })

  it('ignores corrupt entries', () => {
    const storage = memoryStorage()
    storage.setItem(undoKey('p', 'index'), '{"v":1,"pool":[],"past":[],"present":[0,0],"future":[]}')
    expect(readUndoStack(storage, 'p', 'index')).toBeNull()
    storage.setItem(undoKey('p', 'index'), 'not json')
    expect(readUndoStack(storage, 'p', 'index')).toBeNull()
  })
})

describe('jumpTo', () => {
  it('moves the present to any step', () => {
    const state = stack('index', 4)
    const back = jumpTo(state, 1)
    expect(timeline(back).current).toBe(1)
    expect(back.present).toEqual(state.past[1])
    expect(back.future).toHaveLength(3)
    expect(jumpTo(back, 4)).toEqual(state)
    expect(jumpTo(state, 99)).toBe(state)
  })
})
