import { effect, signal } from '@preact/signals'
import { canvasRect } from '../../shell.js'
import { framePage, pageScroller } from '../page-frame.js'
import type { Editor } from '../state/editor.js'
import type { Dispose } from './reactions.js'

const SCROLL_KEY = 'bearminion:scroll'

/** The page's scroll position is kept per address for the browser session: a save reloads the page in place. */
function readScroll(): number | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? 'null') as { path?: unknown; top?: unknown } | null
    return stored && stored.path === location.pathname && typeof stored.top === 'number' ? stored.top : null
  } catch {
    return null
  }
}

function writeScroll(top: number) {
  try {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ path: location.pathname, top }))
  } catch {
    /* storage blocked: the page opens at its top */
  }
}

/**
 * Frames the page inside the shell: below the top bar, between the navigation and the inspector. The canvas follows
 * the window size, the navigation (open, rail, or hidden in preview) and the inspector.
 */
export function attachShell({ ui, chrome }: Editor): Dispose {
  const size = signal({ width: window.innerWidth, height: window.innerHeight })
  const onResize = () => {
    size.value = { width: window.innerWidth, height: window.innerHeight }
    chrome.onWindowResize(window.innerWidth)
  }
  window.addEventListener('resize', onResize)

  let restored = false
  const stop = effect(() => {
    const previewing = ui.previewing.value
    const inspector = !previewing && ui.view.value === 'canvas' && ui.open.value
    framePage(
      canvasRect({
        windowWidth: size.value.width,
        windowHeight: size.value.height,
        nav: previewing ? 'hidden' : ui.navOpen.value ? 'open' : 'rail',
        inspector: inspector ? ui.inspectorWidth.value : 0,
      }),
    )
    if (restored) return
    restored = true
    // The browser restores the window's scroll on reload, not that of an element: the shell does it for <body>.
    const top = readScroll()
    if (top !== null) document.body.scrollTop = top
  })

  const onLeave = () => writeScroll(pageScroller().scrollTop)
  window.addEventListener('pagehide', onLeave)
  return () => {
    stop()
    window.removeEventListener('resize', onResize)
    window.removeEventListener('pagehide', onLeave)
    framePage(null)
  }
}
