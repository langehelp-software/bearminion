import { isTyping } from '../dom.js'
import type { Editor } from '../state/editor.js'
import type { Dispose } from './reactions.js'

function inModal(event: KeyboardEvent): boolean {
  return event.composedPath().some((node) => node instanceof HTMLElement && node.classList.contains('bm-modal'))
}

/** ⌘S save, ⌘Z / ⇧⌘Z undo and redo, ⌘E the sidebar, Enter to confirm, and Esc to back out one layer at a time. */
export function attachShortcuts(editor: Editor): Dispose {
  const { ui, session, sections, chrome } = editor

  const onEscape = (event: KeyboardEvent) => {
    // The image picker closes itself, one layer at a time.
    if (inModal(event)) return
    if (ui.dismissDialog() || ui.closePopovers()) {
      event.preventDefault()
      return
    }
    const active = document.activeElement
    if (active instanceof HTMLElement && active.isContentEditable) {
      active.blur()
      ui.rich.value = null
      event.preventDefault()
      return
    }
    if (ui.open.peek() && !isTyping(event.target)) ui.open.value = false
  }

  const onKey = (event: KeyboardEvent) => {
    // A browser's autofill dispatches keydown events with no `key` at all.
    const key = (event.key ?? '').toLowerCase()
    const mod = event.metaKey || event.ctrlKey
    if (mod && key === 's') {
      event.preventDefault()
      void session.saveAndGo(null)
      return
    }
    if (ui.previewing.peek()) {
      // An open dialog (the gallery lightbox) takes Escape first.
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        event.preventDefault()
        chrome.exitPreview()
      }
      return
    }
    if (mod && (key === 'z' || key === 'y') && !isTyping(event.target)) {
      // Inside a text field the browser's own undo handles the text.
      event.preventDefault()
      if (key === 'y' || event.shiftKey) editor.stepRedo()
      else editor.stepUndo()
      return
    }
    if (mod && key === 'e' && !isTyping(event.target)) {
      event.preventDefault()
      ui.open.value = !ui.open.peek()
      return
    }
    if (event.key === 'Enter' && ui.confirm.peek() && !isTyping(event.target)) {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('[role="alertdialog"]') && target.tagName === 'BUTTON') return
      event.preventDefault()
      sections.confirm()
      return
    }
    if (event.key === 'Escape') onEscape(event)
  }

  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
}
