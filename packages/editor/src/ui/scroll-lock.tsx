import { useLayoutEffect } from 'preact/hooks'
import { FRAMED_ATTR } from './page-frame.js'

let locks = 0
let saved: { overflow: string; gutter: string; framed: boolean } | null = null

function lock() {
  locks += 1
  if (locks > 1) return
  const root = document.documentElement
  // In the shell the page scrolls inside `<body>`, so that is what stops.
  if (root.hasAttribute(FRAMED_ATTR)) {
    saved = { overflow: document.body.style.getPropertyValue('overflow'), gutter: '', framed: true }
    document.body.style.setProperty('overflow', 'hidden', 'important')
    return
  }
  // Hiding the page scrollbar widens the page by its width. The gutter keeps that space, so nothing shifts.
  // Only when a scrollbar is there: on a short page the gutter would itself add the shift.
  const hasScrollbar = window.innerWidth - root.clientWidth > 0
  saved = { overflow: root.style.overflow, gutter: root.style.scrollbarGutter, framed: false }
  if (hasScrollbar) root.style.scrollbarGutter = 'stable'
  root.style.overflow = 'hidden'
}

function unlock() {
  locks = Math.max(0, locks - 1)
  if (locks > 0 || !saved) return
  if (saved.framed) {
    if (saved.overflow) document.body.style.setProperty('overflow', saved.overflow)
    else document.body.style.removeProperty('overflow')
    saved = null
    return
  }
  const root = document.documentElement
  root.style.overflow = saved.overflow
  root.style.scrollbarGutter = saved.gutter
  saved = null
}

/** While mounted, the page behind a modal does not scroll and does not shift. Nested modals share one lock. */
export function ScrollLock() {
  useLayoutEffect(() => {
    lock()
    return unlock
  }, [])
  return null
}
