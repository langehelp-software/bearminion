import { useEffect } from 'preact/hooks'

let locks = 0
let saved: { overflow: string; gutter: string } | null = null

function lock() {
  locks += 1
  if (locks > 1) return
  const root = document.documentElement
  // Hiding the page scrollbar widens the page by its width. The gutter keeps that space, so nothing shifts.
  // Only when a scrollbar is there: on a short page the gutter would itself add the shift.
  const hasScrollbar = window.innerWidth - root.clientWidth > 0
  saved = { overflow: root.style.overflow, gutter: root.style.scrollbarGutter }
  if (hasScrollbar) root.style.scrollbarGutter = 'stable'
  root.style.overflow = 'hidden'
}

function unlock() {
  locks = Math.max(0, locks - 1)
  if (locks > 0 || !saved) return
  const root = document.documentElement
  root.style.overflow = saved.overflow
  root.style.scrollbarGutter = saved.gutter
  saved = null
}

/** While mounted, the page behind a modal does not scroll and does not shift. Nested modals share one lock. */
export function ScrollLock() {
  useEffect(() => {
    lock()
    return unlock
  }, [])
  return null
}
