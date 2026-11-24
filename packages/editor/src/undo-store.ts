import type { KeyValueStorage } from './draft-store.js'
import type { DraftSnapshot, UndoState } from './undo-history.js'

/*
 * The undo stacks of one browser tab, kept in sessionStorage: they survive a reload and a switch to another page, and
 * go when the tab closes. One key per page. Snapshots share text through a pool, so the site JSON, which most steps
 * leave alone, is stored once per distinct value rather than once per step.
 */

const PREFIX = 'bearminion:undo:'

/** Upper bound for one page's stack, in UTF-16 code units (what the storage quota counts). Oldest steps drop first. */
export const UNDO_STORE_BUDGET = 1_000_000

type Ref = [page: number, site: number, at?: number]

interface StoredStack {
  v: 1
  pool: string[]
  /** Each snapshot as [page, site] indexes into `pool`, and when it was recorded. */
  past: Ref[]
  present: Ref
  future: Ref[]
  touched: number
}

export function undoKey(projectId: string, slug: string): string {
  return `${PREFIX}${projectId}:${slug}`
}

function encode(state: UndoState, touched: number): StoredStack {
  const pool: string[] = []
  const index = new Map<string, number>()
  const ref = (text: string): number => {
    let at = index.get(text)
    if (at === undefined) {
      at = pool.length
      pool.push(text)
      index.set(text, at)
    }
    return at
  }
  const pair = (snapshot: DraftSnapshot): Ref =>
    snapshot.at === undefined ? [ref(snapshot.page), ref(snapshot.site)] : [ref(snapshot.page), ref(snapshot.site), snapshot.at]
  const present = pair(state.present)
  const past = state.past.map(pair)
  const future = state.future.map(pair)
  return { v: 1, pool, past, present, future, touched }
}

function decode(slug: string, stored: StoredStack): UndoState | null {
  const at = ([page, site, time]: Ref): DraftSnapshot | null => {
    const p = stored.pool[page]
    const s = stored.pool[site]
    if (typeof p !== 'string' || typeof s !== 'string') return null
    return typeof time === 'number' ? { page: p, site: s, at: time } : { page: p, site: s }
  }
  const present = at(stored.present)
  if (!present) return null
  const past = stored.past.map(at)
  const future = stored.future.map(at)
  if (past.includes(null) || future.includes(null)) return null
  return { slug, past: past as DraftSnapshot[], present, future: future as DraftSnapshot[] }
}

function isStored(value: unknown): value is StoredStack {
  if (!value || typeof value !== 'object') return false
  const stack = value as Partial<StoredStack>
  return (
    stack.v === 1 && Array.isArray(stack.pool) && Array.isArray(stack.past) && Array.isArray(stack.future) && Array.isArray(stack.present)
  )
}

export function readUndoStack(storage: KeyValueStorage, projectId: string, slug: string): UndoState | null {
  try {
    const raw = storage.getItem(undoKey(projectId, slug))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isStored(parsed) ? decode(slug, parsed) : null
  } catch {
    return null
  }
}

/** Drop the oldest undo steps, then the farthest redo steps, until the stack fits `budget`. */
export function fitUndoStack(state: UndoState, budget: number, touched = Date.now()): { state: UndoState; text: string } {
  let current = state
  for (;;) {
    const text = JSON.stringify(encode(current, touched))
    if (text.length <= budget) return { state: current, text }
    if (current.past.length > 0) current = { ...current, past: current.past.slice(Math.ceil(current.past.length / 4)) }
    else if (current.future.length > 0) current = { ...current, future: current.future.slice(0, Math.floor(current.future.length / 2)) }
    else return { state: current, text }
  }
}

/**
 * Keep the stack. When the tab's storage is full, the least recently used stacks of other pages go first, then this
 * one shrinks. Never throws: undo still works in memory when nothing can be stored.
 */
export function writeUndoStack(storage: KeyValueStorage, projectId: string, state: UndoState, budget = UNDO_STORE_BUDGET): void {
  const key = undoKey(projectId, state.slug)
  let { state: fitted, text } = fitUndoStack(state, budget)
  for (let attempt = 0; attempt < 32; attempt += 1) {
    try {
      storage.setItem(key, text)
      return
    } catch {
      if (evictOldest(storage, projectId, key)) continue
      if (fitted.past.length === 0 && fitted.future.length === 0) break
      ;({ state: fitted, text } = fitUndoStack(fitted, Math.floor(text.length / 2)))
    }
  }
  try {
    storage.removeItem(key)
  } catch {
    // Storage is unusable. Undo keeps working in memory.
  }
}

function evictOldest(storage: KeyValueStorage, projectId: string, keep: string): boolean {
  let oldest: { key: string; touched: number } | null = null
  for (const key of storage.keys()) {
    if (key === keep || !key.startsWith(`${PREFIX}${projectId}:`)) continue
    let touched = 0
    try {
      const parsed: unknown = JSON.parse(storage.getItem(key) ?? 'null')
      if (isStored(parsed)) touched = parsed.touched
    } catch {
      // Unreadable: the first to go.
    }
    if (oldest === null || touched < oldest.touched) oldest = { key, touched }
  }
  if (oldest === null) return false
  storage.removeItem(oldest.key)
  return true
}

/** The tab's sessionStorage, or null when the browser blocks it. */
export function sessionUndoStorage(): KeyValueStorage | null {
  try {
    const storage = window.sessionStorage
    const probe = `${PREFIX}probe`
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return {
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => storage.setItem(key, value),
      removeItem: (key) => storage.removeItem(key),
      keys: () => Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => key !== null),
    }
  } catch {
    return null
  }
}
