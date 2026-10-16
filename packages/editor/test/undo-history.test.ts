import { describe, expect, it } from 'vitest'
import {
  UNDO_LIMIT,
  canRedo,
  canUndo,
  recordSnapshot,
  redoSnapshot,
  startHistory,
  undoSnapshot,
  type DraftSnapshot,
} from '../src/undo-history.js'

const snap = (page: string, site = 's'): DraftSnapshot => ({ page, site })

describe('undo history', () => {
  it('starts with nothing to undo or redo', () => {
    const state = startHistory('index', snap('a'))
    expect(canUndo(state)).toBe(false)
    expect(canRedo(state)).toBe(false)
  })

  it('ignores a snapshot equal to the present', () => {
    const state = startHistory('index', snap('a'))
    expect(recordSnapshot(state, snap('a'))).toBe(state)
  })

  it('undoes and redoes through recorded steps', () => {
    let state = startHistory('index', snap('a'))
    state = recordSnapshot(state, snap('b'))
    state = recordSnapshot(state, snap('c'))
    state = undoSnapshot(state)
    expect(state.present).toEqual(snap('b'))
    state = undoSnapshot(state)
    expect(state.present).toEqual(snap('a'))
    expect(undoSnapshot(state)).toBe(state)
    state = redoSnapshot(state)
    expect(state.present).toEqual(snap('b'))
    expect(canRedo(state)).toBe(true)
  })

  it('treats a site change as its own step', () => {
    let state = startHistory('index', snap('a', 'x'))
    state = recordSnapshot(state, snap('a', 'y'))
    expect(undoSnapshot(state).present).toEqual(snap('a', 'x'))
  })

  it('drops redo steps when a new change is recorded', () => {
    let state = startHistory('index', snap('a'))
    state = recordSnapshot(state, snap('b'))
    state = undoSnapshot(state)
    state = recordSnapshot(state, snap('c'))
    expect(canRedo(state)).toBe(false)
    expect(state.past).toEqual([snap('a')])
  })

  it('keeps at most UNDO_LIMIT steps', () => {
    let state = startHistory('index', snap('0'))
    for (let i = 1; i <= UNDO_LIMIT + 20; i += 1) state = recordSnapshot(state, snap(String(i)))
    expect(state.past).toHaveLength(UNDO_LIMIT)
    expect(state.past[0]).toEqual(snap('20'))
  })
})
