import { computed, signal } from '@preact/signals'
import type { KeyValueStorage } from '../../draft-store.js'
import {
  canRedo,
  canUndo,
  type DraftSnapshot,
  jumpTo,
  recordSnapshot,
  redoSnapshot,
  startHistory,
  timeline,
  undoSnapshot,
  type UndoState,
} from '../../undo-history.js'
import { readUndoStack, sessionUndoStorage, writeUndoStack } from '../../undo-store.js'
import type { DocumentStore } from './document.js'

/** How long edits must pause before they count as one undo step. */
export const HISTORY_SETTLE_MS = 450

/**
 * Undo history over both drafts, one stack per document, kept for the life of the browser tab. Every settled change
 * is one step; typing bursts collapse into one. A reload or a visit to another page keeps the stack: coming back
 * records the document as it now is, so Undo first returns to where the last visit left it.
 * `apply` puts a snapshot back into the drafts and the page.
 */
export function createUndo(
  doc: DocumentStore,
  apply: (snapshot: DraftSnapshot) => void,
  storage: KeyValueStorage | null = typeof window === 'undefined' ? null : sessionUndoStorage(),
) {
  const history = signal<UndoState | null>(null)
  const undoable = computed(() => history.value !== null && canUndo(history.value))
  const redoable = computed(() => history.value !== null && canRedo(history.value))
  const steps = computed(() => (history.value ? timeline(history.value) : { steps: [], current: -1 }))
  /** Stacks of documents visited in this tab. Storage may hold fewer steps (its budget), or nothing when blocked. */
  const stacks = new Map<string, UndoState>()
  let timer: number | null = null

  function clearTimer() {
    if (timer !== null) window.clearTimeout(timer)
    timer = null
  }

  function snapshot(): DraftSnapshot | null {
    const page = doc.page.peek()
    const site = doc.site.peek()
    if (page === null || site === null) return null
    return { page: JSON.stringify(page), site: JSON.stringify(site), at: Date.now() }
  }

  function resume(slug: string): UndoState | null {
    const kept = stacks.get(slug)
    if (kept) return kept
    const id = doc.projectId.peek()
    return storage && id ? readUndoStack(storage, id, slug) : null
  }

  function set(next: UndoState) {
    history.value = next
    stacks.set(next.slug, next)
    const id = doc.projectId.peek()
    if (storage && id) writeUndoStack(storage, id, next)
  }

  /** Record the draft as it is now. Called when edits settle, and before an undo so pending edits count as a step. */
  function flush() {
    clearTimer()
    const next = snapshot()
    if (!next) return
    const current = history.peek()
    const slug = doc.draftId.peek()
    if (current === null || current.slug !== slug) {
      const kept = resume(slug)
      set(kept ? recordSnapshot(kept, next) : startHistory(slug, next))
      return
    }
    const recorded = recordSnapshot(current, next)
    if (recorded !== current) set(recorded)
  }

  /** Called on every draft change. The first change of a document records at once; later ones wait to settle. */
  function noteChange() {
    if (doc.page.peek() === null || doc.site.peek() === null) return
    const current = history.peek()
    if (current === null || current.slug !== doc.draftId.peek()) {
      flush()
      return
    }
    clearTimer()
    timer = window.setTimeout(flush, HISTORY_SETTLE_MS)
  }

  function move(next: UndoState) {
    set(next)
    apply(next.present)
  }

  function undo(): boolean {
    flush()
    const current = history.peek()
    if (!current || !canUndo(current)) return false
    move(undoSnapshot(current))
    return true
  }

  function redo(): boolean {
    const current = history.peek()
    if (!current || !canRedo(current)) return false
    move(redoSnapshot(current))
    return true
  }

  /** Go to step `index` of `steps`, as if undone or redone that many times. */
  function goTo(index: number): boolean {
    flush()
    const current = history.peek()
    if (!current || index === timeline(current).current || !timeline(current).steps[index]) return false
    move(jumpTo(current, index))
    return true
  }

  return { undoable, redoable, steps, flush, noteChange, undo, redo, goTo, dispose: clearTimer }
}

export type Undo = ReturnType<typeof createUndo>
