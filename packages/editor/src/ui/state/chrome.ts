import { batch } from '@preact/signals'
import { clampSidebarWidth, SIDEBAR_DEFAULT, SIDEBAR_OPEN_KEY, SIDEBAR_WIDTH_KEY } from '../../sidebar.js'
import { destroyRichEditors } from '../rich-editor.js'
import { TABS } from '../types.js'
import type { UiState } from './ui.js'

const PREVIEW_KEY = 'bearminion:preview'

function readStorage(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key)
  } catch {
    return null
  }
}

/** Write, or remove with `null`. Private mode and a full disk keep the value for this page view only. */
function writeStorage(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key)
    else storage().setItem(key, value)
  } catch {
    /* storage blocked: not remembered */
  }
}

const local = () => localStorage
const session = () => sessionStorage

/** The editor's own frame: sidebar width and visibility, and preview mode. Each survives a reload. */
export function createChrome(ui: UiState) {
  let reopenAfterPreview = false

  /** Hide every editor panel, outline and bar so the page looks as visitors see it. Esc or the bubble returns. */
  function enterPreview() {
    reopenAfterPreview = ui.open.peek()
    writeStorage(session, PREVIEW_KEY, reopenAfterPreview ? '1' : '0')
    batch(() => {
      ui.previewing.value = true
      ui.open.value = false
      ui.closePopovers()
      ui.rich.value = null
      ui.pagePick.value = null
    })
    destroyRichEditors()
    for (const node of document.querySelectorAll('[data-field][contenteditable]')) node.removeAttribute('contenteditable')
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    document.documentElement.style.cursor = ''
  }

  function exitPreview() {
    writeStorage(session, PREVIEW_KEY, null)
    batch(() => {
      ui.previewing.value = false
      ui.open.value = reopenAfterPreview
    })
  }

  function resizeSidebar(next: number): number {
    const width = clampSidebarWidth(next, window.innerWidth)
    ui.sidebarWidth.value = width
    writeStorage(local, SIDEBAR_WIDTH_KEY, String(width))
    return width
  }

  /** Width, the open sidebar and its tab, and preview mode, as the last page view left them. */
  function restore() {
    const width = readStorage(local, SIDEBAR_WIDTH_KEY)
    ui.sidebarWidth.value = clampSidebarWidth(width ? Number(width) : SIDEBAR_DEFAULT, window.innerWidth)
    const openTab = readStorage(local, SIDEBAR_OPEN_KEY)
    if (openTab !== null) {
      const restored = TABS.find((id) => id === openTab)
      batch(() => {
        if (restored) ui.tab.value = restored
        ui.open.value = true
      })
    }
    // Preview mode survives a reload for the rest of the browser session, until it is turned off.
    const previewed = readStorage(session, PREVIEW_KEY)
    if (previewed !== null) {
      enterPreview()
      reopenAfterPreview = previewed === '1'
      writeStorage(session, PREVIEW_KEY, previewed)
    }
  }

  /** Reopen after a reload on the tab that was showing. A closed sidebar forgets the tab, so the next open starts on Pages. */
  function rememberOpen(open: boolean, tab: string) {
    writeStorage(local, SIDEBAR_OPEN_KEY, open ? tab : null)
  }

  return { enterPreview, exitPreview, resizeSidebar, restore, rememberOpen }
}

export type Chrome = ReturnType<typeof createChrome>
