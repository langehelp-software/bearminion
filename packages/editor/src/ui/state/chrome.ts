import { batch } from '@preact/signals'
import {
  clampInspectorWidth,
  INSPECTOR_CLOSE_BELOW,
  INSPECTOR_DEFAULT,
  INSPECTOR_OPEN_KEY,
  INSPECTOR_WIDTH_KEY,
  NAV_OPEN_KEY,
  parseView,
  VIEW_KEY,
} from '../../shell.js'
import { destroyRichEditors } from '../rich-editor.js'
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

/**
 * The editor's own frame: the navigation, the inspector, the full-screen view and preview mode. Each survives a
 * reload: opening another document or saving reloads the page, and the shell comes back as it was.
 */
export function createChrome(ui: UiState) {
  /** Hide the navigation, the inspector and every outline and bar, so the page looks as visitors see it. Esc returns. */
  function enterPreview() {
    writeStorage(session, PREVIEW_KEY, '1')
    batch(() => {
      ui.previewing.value = true
      ui.view.value = 'canvas'
      ui.viewport.value = 'desktop'
      ui.dialog.value = null
      ui.closePopovers()
      ui.rich.value = null
      ui.pagePick.value = null
    })
    destroyRichEditors()
    for (const node of document.querySelectorAll('[data-field][contenteditable]')) node.removeAttribute('contenteditable')
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    document.documentElement.style.cursor = ''
    document.documentElement.setAttribute('data-bearminion-preview', '')
  }

  function exitPreview() {
    document.documentElement.removeAttribute('data-bearminion-preview')
    writeStorage(session, PREVIEW_KEY, null)
    ui.previewing.value = false
  }

  function resizeInspector(next: number): number {
    const width = clampInspectorWidth(next)
    ui.inspectorWidth.value = width
    writeStorage(local, INSPECTOR_WIDTH_KEY, String(width))
    return width
  }

  function toggleNav() {
    const next = !ui.navOpen.peek()
    ui.navOpen.value = next
    writeStorage(local, NAV_OPEN_KEY, next ? '1' : '0')
  }

  /** Close the inspector once when the window gets narrower than it can share. Opening it again keeps it open. */
  let wasWide = typeof window === 'undefined' ? true : window.innerWidth >= INSPECTOR_CLOSE_BELOW
  function onWindowResize(width: number) {
    const wide = width >= INSPECTOR_CLOSE_BELOW
    if (wasWide && !wide) ui.open.value = false
    wasWide = wide
  }

  /** The navigation, the inspector and its width, the view, and preview mode, as the last page view left them. */
  function restore() {
    ui.navOpen.value = readStorage(local, NAV_OPEN_KEY) !== '0'
    const width = readStorage(local, INSPECTOR_WIDTH_KEY)
    ui.inspectorWidth.value = clampInspectorWidth(width ? Number(width) : INSPECTOR_DEFAULT)
    const open = readStorage(session, INSPECTOR_OPEN_KEY)
    ui.open.value = open === null ? window.innerWidth >= INSPECTOR_CLOSE_BELOW : open === '1'
    ui.view.value = parseView(readStorage(session, VIEW_KEY))
    wasWide = window.innerWidth >= INSPECTOR_CLOSE_BELOW
    // Preview mode survives a reload for the rest of the browser session, until it is turned off.
    if (readStorage(session, PREVIEW_KEY) !== null) enterPreview()
  }

  /** Keep the view and whether the inspector is open for the next page view of this browser session. */
  function remember(view: string, open: boolean) {
    writeStorage(session, VIEW_KEY, view === 'canvas' ? null : view)
    writeStorage(session, INSPECTOR_OPEN_KEY, open ? '1' : '0')
  }

  return { enterPreview, exitPreview, resizeInspector, toggleNav, onWindowResize, restore, remember }
}

export type Chrome = ReturnType<typeof createChrome>
