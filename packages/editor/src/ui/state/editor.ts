import { batch } from '@preact/signals'
import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
import type { PageDraft } from '../../draft.js'
import { imageObjectPath } from '../../draft.js'
import { fieldPathOf, paintPage, resolvePath } from '../dom.js'
import type { RichEditor } from '../rich-editor.js'
import type { SiteDraft } from '../types.js'
import { createChrome } from './chrome.js'
import { createDocumentStore } from './document.js'
import { createEdits } from './edits.js'
import { createLayout } from './layout.js'
import { createLinkEditor } from './link-editor.js'
import { createLivePreview } from './live-preview.js'
import { createLocalDrafts } from './local-drafts.js'
import { createOverlayModel } from './overlay.js'
import { createSectionActions } from './sections.js'
import { createSession } from './session.js'
import { createUiState } from './ui.js'
import { createUndo } from './undo.js'

/**
 * One editor instance: its state and the actions on it. Building it has no side effects; `attachEditor` connects it
 * to the page, and the components read it through `useEditor`.
 */
export function createEditor() {
  const doc = createDocumentStore()
  const ui = createUiState()
  const layout = createLayout(doc)
  const preview = createLivePreview(doc, layout.schedule)
  const edits = createEdits(doc, preview)
  const undo = createUndo(doc, (snapshot) => {
    const page = JSON.parse(snapshot.page) as PageDraft
    batch(() => {
      doc.page.value = page
      doc.site.value = JSON.parse(snapshot.site) as SiteDraft
    })
    paintPage(page)
    preview.schedulePage()
    preview.scheduleSite()
  })
  const drafts = createLocalDrafts(doc, ui)
  const session = createSession(doc, ui, edits, drafts)
  const sections = createSectionActions(doc, ui, edits)
  const links = createLinkEditor(doc, ui, edits, preview)
  const chrome = createChrome(ui)
  const overlay = createOverlayModel(doc, ui, layout)
  /** The rich-text field the formatting bar acts on. */
  const richTarget: { current: RichEditor | null } = { current: null }

  function stepUndo() {
    if (undo.undo()) ui.status.value = 'Undone.'
  }

  function stepRedo() {
    if (undo.redo()) ui.status.value = 'Redone.'
  }

  /** Load a saved version into the draft. It is a normal edit: undoable, and written only when saved. */
  function restoreVersion(scope: 'page' | 'site', data: unknown, when: string) {
    undo.flush()
    if (scope === 'page') {
      const next = data as PageDraft
      doc.page.value = next
      paintPage(next)
      preview.schedulePage()
    } else {
      doc.site.value = data as SiteDraft
      preview.scheduleSite()
    }
    ui.status.value = `Loaded the version from ${when}. Save to keep it.`
  }

  /** Bring back the drafts this browser kept from an earlier visit. */
  function restoreOffer() {
    const offer = ui.draftOffer.peek()
    if (!offer) return
    const page = offer.page && typeof offer.page === 'object' ? (offer.page as PageDraft) : null
    batch(() => {
      if (page) doc.page.value = page
      if (offer.site && typeof offer.site === 'object') doc.site.value = offer.site as SiteDraft
      ui.draftOffer.value = null
      ui.open.value = true
      ui.status.value = 'Restored unsaved changes. Save to write them to disk.'
    })
    if (page) {
      paintPage(page)
      void preview.renderPage(page)
    }
  }

  function discardOffer() {
    drafts.dropStored()
    batch(() => {
      ui.draftOffer.value = null
      ui.status.value = 'Discarded the unsaved draft.'
    })
  }

  /** Same as clicking the image on the page: the picker opens over the page, no sidebar. */
  function openImagePicker(field: HTMLElement) {
    ui.pagePick.value = imageObjectPath(resolvePath(field, fieldPathOf(field), doc.page.peek()))
  }

  function dispose() {
    layout.dispose()
    preview.dispose()
    undo.dispose()
  }

  return {
    doc,
    ui,
    layout,
    preview,
    edits,
    undo,
    drafts,
    session,
    sections,
    links,
    chrome,
    overlay,
    richTarget,
    stepUndo,
    stepRedo,
    restoreVersion,
    restoreOffer,
    discardOffer,
    openImagePicker,
    dispose,
  }
}

export type Editor = ReturnType<typeof createEditor>

export const EditorContext = createContext<Editor | null>(null)

export function useEditor(): Editor {
  const editor = useContext(EditorContext)
  if (!editor) throw new Error('bearminion: useEditor must be used inside <EditorApp>.')
  return editor
}
