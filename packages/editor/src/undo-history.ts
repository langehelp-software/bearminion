/**
 * Undo and redo for the editor draft. A step is a snapshot of the page and the site as JSON text, so structural
 * changes (add, move, delete, duplicate) undo the same way as edits to a field. Pure: the editor decides when to record.
 */

export interface DraftSnapshot {
  page: string
  site: string
}

export interface UndoState {
  /** Slug the stack belongs to. A different page starts a new stack. */
  slug: string
  past: DraftSnapshot[]
  present: DraftSnapshot
  future: DraftSnapshot[]
}

export const UNDO_LIMIT = 100

const same = (a: DraftSnapshot, b: DraftSnapshot): boolean => a.page === b.page && a.site === b.site

export function startHistory(slug: string, present: DraftSnapshot): UndoState {
  return { slug, past: [], present, future: [] }
}

/** Make `next` the present. The old present becomes an undo step and any redo steps are dropped. */
export function recordSnapshot(state: UndoState, next: DraftSnapshot): UndoState {
  if (same(state.present, next)) return state
  return {
    slug: state.slug,
    past: [...state.past, state.present].slice(-UNDO_LIMIT),
    present: next,
    future: [],
  }
}

export function canUndo(state: UndoState): boolean {
  return state.past.length > 0
}

export function canRedo(state: UndoState): boolean {
  return state.future.length > 0
}

export function undoSnapshot(state: UndoState): UndoState {
  const previous = state.past[state.past.length - 1]
  if (!previous) return state
  return {
    slug: state.slug,
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
  }
}

export function redoSnapshot(state: UndoState): UndoState {
  const [next, ...rest] = state.future
  if (!next) return state
  return {
    slug: state.slug,
    past: [...state.past, state.present],
    present: next,
    future: rest,
  }
}
