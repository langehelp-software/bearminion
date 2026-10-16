import { isForeignSave, savedNoticeFor } from '../../draft-store.js'
import type { Editor } from '../state/editor.js'
import { tabId } from '../state/local-drafts.js'
import type { Dispose } from './reactions.js'

type HotContext = { on: (event: string, callback: () => void) => void; off?: (event: string, callback: () => void) => void }

const CONTENT_RELOAD_EVENT = 'bearminion:content-reload'

/** Same-page links (hash jumps, the current URL) never leave, so they never ask. */
function leavingLink(event: MouseEvent): URL | null {
  if (event.defaultPrevented || event.button !== 0) return null
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null
  if (!(event.target instanceof Element)) return null
  const anchor = event.target.closest('a[href]')
  if (!(anchor instanceof HTMLAnchorElement)) return null
  if (anchor.target === '_blank' || anchor.hasAttribute('download')) return null
  const url = new URL(anchor.href, location.href)
  if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) return null
  return url
}

/**
 * Nothing unsaved is lost on the way out of the page: Astro's content reloads, Vite's full reloads, link clicks and
 * closing the tab all go through the save-or-discard prompt while the draft is dirty.
 */
export function attachReloadGuard({ doc, ui, session }: Editor): Dispose {
  const onContentReload = () => session.onContentReload()
  const hot = (import.meta as ImportMeta & { hot?: HotContext }).hot
  hot?.on(CONTENT_RELOAD_EVENT, onContentReload)

  // Vite calls `location.reload()` for a full reload. Route it through the prompt; the editor keeps the native one.
  const nativeReload = location.reload.bind(location)
  session.setNativeReload(nativeReload)
  try {
    Object.defineProperty(location, 'reload', { configurable: true, value: onContentReload })
  } catch {
    // Unexpected Vite reloads keep the draft in localStorage for the next page.
  }

  const onClick = (event: MouseEvent) => {
    const url = leavingLink(event)
    if (!url || !doc.dirty.peek()) return
    event.preventDefault()
    event.stopPropagation()
    session.requestLeave(url.href)
  }
  const onStorage = (event: StorageEvent) => {
    const id = doc.projectId.peek()
    if (!id || !event.key) return
    if (!savedNoticeFor(event.key, id, doc.savedSlug.peek())) return
    if (isForeignSave(event.newValue, tabId(), Date.now())) ui.tabNotice.value = 'Another tab saved this page.'
  }
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!doc.dirty.peek() || session.isLeaving()) return
    event.preventDefault()
    event.returnValue = ''
  }

  document.addEventListener('click', onClick, true)
  window.addEventListener('storage', onStorage)
  window.addEventListener('beforeunload', onBeforeUnload)
  return () => {
    hot?.off?.(CONTENT_RELOAD_EVENT, onContentReload)
    document.removeEventListener('click', onClick, true)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('beforeunload', onBeforeUnload)
    try {
      Object.defineProperty(location, 'reload', { configurable: true, value: nativeReload })
    } catch {
      // The native reload was not replaced.
    }
  }
}
