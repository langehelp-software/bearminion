import { computed, signal } from '@preact/signals'
import {
  canRedo,
  canUndo,
  type DraftSnapshot,
  recordSnapshot,
  redoSnapshot,
  startHistory,
  undoSnapshot,
  type UndoState,
} from '../../undo-history.js'
import type { DocumentStore } from './document.js'

/** How long edits must pause before they count as one undo step. */
export const HISTORY_SETTLE_MS = 450

/**
 * Undo history over both drafts. Every settled change is one step; typing bursts collapse into one.
 * `apply` puts a snapshot back into the drafts and the page.
 */
export function createUndo(doc: DocumentStore, apply: (snapshot: DraftSnapshot) => void) {
  const history = signal<UndoState | null>(null)
  const undoable = computed(() => history.value !== null && canUndo(history.value))
  const redoable = computed(() => history.value !== null && canRedo(history.value))
  let timer: number | null = null

  function clearTimer() {
    if (timer !== null) window.clearTimeout(timer)
    timer = null
  }

  function snapshot(): DraftSnapshot | null {
    const page = doc.page.peek()
    const site = doc.site.peek()
    if (page === null || site === null) return null
    return { page: JSON.stringify(page), site: JSON.stringify(site) }
  }

  /** Record the draft as it is now. Called when edits settle, and before an undo so pending edits count as a step. */
  function flush() {
    clearTimer()
    const next = snapshot()
    if (!next) return
    const current = history.peek()
    const slug = doc.savedSlug.peek()
    history.value = current === null || current.slug !== slug ? startHistory(slug, next) : recordSnapshot(current, next)
  }

  /** Called on every draft change. The first change of a page records at once; later ones wait to settle. */
  function noteChange() {
    if (doc.page.peek() === null || doc.site.peek() === null) return
    const current = history.peek()
    if (current === null || current.slug !== doc.savedSlug.peek()) {
      flush()
      return
    }
    clearTimer()
    timer = window.setTimeout(flush, HISTORY_SETTLE_MS)
  }

  function undo(): boolean {
    flush()
    const current = history.peek()
    if (!current || !canUndo(current)) return false
    const next = undoSnapshot(current)
    history.value = next
    apply(next.present)
    return true
  }

  function redo(): boolean {
    const current = history.peek()
    if (!current || !canRedo(current)) return false
    const next = redoSnapshot(current)
    history.value = next
    apply(next.present)
    return true
  }

  return { undoable, redoable, flush, noteChange, undo, redo, dispose: clearTimer }
}

export type Undo = ReturnType<typeof createUndo>
