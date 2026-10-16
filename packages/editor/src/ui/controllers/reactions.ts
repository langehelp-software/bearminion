import { computed, effect } from '@preact/signals'
import { getAt } from '../../draft.js'
import { DRAFT_AUTOSAVE_MS } from '../../draft-store.js'
import { themeCss } from '../../theme-colors.js'
import { themeColorsOf } from '../site-draft.js'
import type { Editor } from '../state/editor.js'

export type Dispose = () => void

/** Signal effects that keep the page, storage and history in step with the editor state. */
export function attachReactions({ doc, ui, layout, undo, drafts, session, chrome }: Editor): Dispose {
  const siteMode = computed(() => (doc.site.value ? getAt(doc.site.value, 'theme.mode') : undefined))
  const paletteCss = computed(() => (doc.site.value ? themeCss(themeColorsOf(doc.site.value)) : null))
  let wasOpen = false

  const stops = [
    // Color mode is an attribute on <html>, so it previews live.
    effect(() => {
      const mode = siteMode.value
      if (mode === 'light' || mode === 'dark') document.documentElement.setAttribute('data-theme', mode)
    }),
    // The layout renders <style id="bm-theme">; this keeps it in step with the draft palette.
    effect(() => {
      const css = paletteCss.value
      if (css === null) return
      let node = document.getElementById('bm-theme')
      if (!node) {
        node = document.createElement('style')
        node.id = 'bm-theme'
        document.head.appendChild(node)
      }
      node.textContent = css
    }),
    // Every settled change to the page or the site becomes one undo step.
    effect(() => {
      doc.page.value
      doc.site.value
      undo.noteChange()
    }),
    // Unsaved drafts go to localStorage shortly after each change.
    effect(() => {
      doc.page.value
      doc.savedPageJson.value
      doc.site.value
      doc.savedSiteJson.value
      ui.draftOffer.value
      const timer = window.setTimeout(() => {
        if (session.isActive()) drafts.persist()
      }, DRAFT_AUTOSAVE_MS)
      return () => window.clearTimeout(timer)
    }),
    // Editing past the restore offer means the old draft is not wanted.
    effect(() => {
      if (ui.draftOffer.value && doc.dirty.value) ui.draftOffer.value = null
    }),
    // Git status changes when the page becomes dirty or clean (a save, a discard).
    effect(() => {
      doc.dirty.value
      void session.loadGit()
    }),
    // Re-measure the overlay when the page or the sidebar changes. The sidebar overlays the page, so nothing reflows,
    // but the bars must clear its edge.
    effect(() => {
      doc.page.value
      doc.site.value
      ui.open.value
      ui.sidebarWidth.value
      ui.previewing.value
      layout.schedule()
    }),
    // Reopen after a reload on the tab that was showing. A closed sidebar forgets the tab, so the next open starts on Pages.
    effect(() => {
      const open = ui.open.value
      const tab = ui.tab.value
      chrome.rememberOpen(open, tab)
      if (!open && wasOpen) ui.tab.value = 'pages'
      wasOpen = open
    }),
  ]
  return () => {
    for (const stop of stops) stop()
  }
}
