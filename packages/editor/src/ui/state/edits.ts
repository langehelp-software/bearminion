import { clearField, editField, editMarks, getAt, isImageField, type PageDraft, type PendingEdit } from '../../draft.js'
import { type MarkPatch, renderMarkedHtml } from '../../marks.js'
import { marksAt } from '../dom.js'
import { isRecord } from '../shared.js'
import { type DocumentStore, isPagePath } from './document.js'
import { affectsSitePreview, type LivePreview } from './live-preview.js'

/** Every change to the drafts goes through here, so each one also gets the preview it needs. */
export function createEdits(doc: DocumentStore, preview: LivePreview) {
  /** Edits made before the drafts finished loading. `load` applies them to what it reads. */
  let pending: PendingEdit[] = []

  function previewFor(path: string) {
    if (isPagePath(path)) preview.schedulePage()
    else if (affectsSitePreview(path)) preview.scheduleSite()
  }

  /** Set a value, or remove the key when it is empty. */
  function writeOrClear(path: string, value: string) {
    const current = doc.docFor(path)
    if (!current) return
    doc.setDoc(path, value ? editField(current, path, value) : clearField(current, path))
  }

  /** `undefined` removes the value. */
  function writeField(path: string, value: unknown) {
    if (value === undefined) {
      writeOrClear(path, '')
      previewFor(path)
      return
    }
    // An emptied or newly filled optional field adds or removes markup, so the page re-renders.
    if (doc.isOptional(path)) {
      const before = getAt(doc.page.peek(), path)
      if (value === '' || before === undefined || before === '') window.setTimeout(preview.schedulePage, 0)
    }
    const current = doc.docFor(path)
    if (!current) {
      pending.push({ path, value })
      return
    }
    doc.setDoc(path, editField(current, path, value))
    if (isPagePath(path) ? isImageField(path) : affectsSitePreview(path)) previewFor(path)
  }

  function updatePage(next: PageDraft, withPreview = false) {
    doc.page.value = next
    if (withPreview) preview.schedulePage()
  }

  /** Style [start, end) of a heading or the site name, from the page or the sidebar. */
  function applyMarksAt(path: string, patch: MarkPatch, start: number, end: number) {
    const current = doc.docFor(path)
    if (!current) return
    const next = editMarks(current, path, patch, start, end)
    const text = getAt(next, path)
    const node = document.querySelector(`[data-field="${CSS.escape(path)}"]`)
    if (node && typeof text === 'string') node.innerHTML = renderMarkedHtml(text, marksAt(next, path))
    if (isPagePath(path)) updatePage(next as PageDraft, true)
    else doc.setDoc(path, next)
  }

  /** Swap the image at `path`, keeping alt, fit and position of the one being replaced. */
  function replaceImage(path: string, src: string) {
    const existing = getAt(doc.docFor(path), path)
    const next = isRecord(existing) ? { ...existing, src, alt: (typeof existing.alt === 'string' && existing.alt) || 'Image' } : src
    writeField(path, next)
    if (isPagePath(path)) preview.schedulePage()
  }

  function takePending(): PendingEdit[] {
    const taken = pending
    pending = []
    return taken
  }

  function returnPending(edits: PendingEdit[]) {
    pending = [...edits, ...pending]
  }

  return { writeField, writeOrClear, updatePage, applyMarksAt, replaceImage, takePending, returnPending }
}

export type Edits = ReturnType<typeof createEdits>
