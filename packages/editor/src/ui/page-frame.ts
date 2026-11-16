import type { CanvasRect } from '../shell.js'

const FRAME_STYLE_ID = 'bearminion-shell-frame'
/** On `<html>` while the page is framed inside the editor shell. */
export const FRAMED_ATTR = 'data-bearminion-shell'
/** On each of the site's `position: fixed` elements while the page is framed. */
export const PINNED_ATTR = 'data-bearminion-pinned'
/** How far `<body>` is scrolled, on `<html>`, so pinned elements can move back by as much. */
const SCROLL_VAR = '--bearminion-page-scroll'
const MARGIN_TOP_VAR = '--bearminion-pin-mt'
const MARGIN_BOTTOM_VAR = '--bearminion-pin-mb'

/**
 * The page's own CSS while it sits in the canvas. `<body>` becomes the scroll container at the canvas rectangle, and
 * its transform makes it the containing block of the site's `position: fixed` elements, so a fixed header or cookie bar
 * stays inside the canvas and a sticky header sticks to the canvas top. Sizes the site set on `<body>` are overridden.
 *
 * A containing block that scrolls takes its fixed elements along, so each one is moved back by the scroll distance:
 * down by its top margin and up by its bottom one, which holds whichever edge it is anchored to.
 */
export function frameCss(rect: CanvasRect): string {
  const body = `html[${FRAMED_ATTR}] > body`
  return [
    `html[${FRAMED_ATTR}] { overflow: hidden !important; }`,
    // A site locks scrolling on <html> behind a modal (a lightbox); in the frame it is <body> that scrolls.
    `html[${FRAMED_ATTR}]:has(dialog:modal) > body { overflow: hidden !important; }`,
    `${body} [${PINNED_ATTR}] { margin-top: calc(var(${MARGIN_TOP_VAR}, 0px) + var(${SCROLL_VAR}, 0px)) !important; margin-bottom: calc(var(${MARGIN_BOTTOM_VAR}, 0px) - var(${SCROLL_VAR}, 0px)) !important; }`,
    `${body} { position: fixed !important; inset: auto !important; top: ${rect.top}px !important; left: ${rect.left}px !important; width: ${rect.width}px !important; height: ${rect.height}px !important; min-width: 0 !important; max-width: none !important; min-height: 0 !important; max-height: none !important; margin: 0 !important; overflow: auto !important; overscroll-behavior: contain; transform: translateZ(0) !important; }`,
  ].join('\n')
}

/** The element that scrolls the page: `<body>` while framed, the document otherwise. */
export function pageScroller(): Element {
  return document.documentElement.hasAttribute(FRAMED_ATTR) ? document.body : (document.scrollingElement ?? document.documentElement)
}

/**
 * Put the page in the canvas, or move it there again after the shell changed size. `null` gives the page the window
 * back. The scroll position carries over both ways, so framing never jumps the page.
 */
export function framePage(rect: CanvasRect | null): void {
  const root = document.documentElement
  let style = document.getElementById(FRAME_STYLE_ID)
  if (rect === null) {
    if (!root.hasAttribute(FRAMED_ATTR)) return
    const top = document.body.scrollTop
    stopPinning()
    root.removeAttribute(FRAMED_ATTR)
    style?.remove()
    window.scrollTo(0, top)
    return
  }
  if (!style) {
    style = document.createElement('style')
    style.id = FRAME_STYLE_ID
    document.head.append(style)
  }
  style.textContent = frameCss(rect)
  if (root.hasAttribute(FRAMED_ATTR)) return
  const top = window.scrollY
  root.setAttribute(FRAMED_ATTR, '')
  document.body.scrollTop = top
  startPinning()
}

let stopPinning: () => void = () => {}

/** Margins as the site styled them, before the pin rule adds the scroll distance. */
function siteMargins(element: HTMLElement): [string, string] {
  const pinned = element.hasAttribute(PINNED_ATTR)
  if (pinned) element.removeAttribute(PINNED_ATTR)
  const style = getComputedStyle(element)
  const margins: [string, string] = [style.marginTop || '0px', style.marginBottom || '0px']
  if (pinned) element.setAttribute(PINNED_ATTR, '')
  return margins
}

/** Mark the site's fixed elements, and only those: one that stops being fixed lets go of its margins. */
export function pinFixedElements(): void {
  for (const element of document.body.querySelectorAll<HTMLElement>('*')) {
    const fixed = getComputedStyle(element).position === 'fixed'
    const pinned = element.hasAttribute(PINNED_ATTR)
    if (fixed && !pinned) {
      const [top, bottom] = siteMargins(element)
      element.style.setProperty(MARGIN_TOP_VAR, top)
      element.style.setProperty(MARGIN_BOTTOM_VAR, bottom)
      element.setAttribute(PINNED_ATTR, '')
    } else if (!fixed && pinned) {
      element.removeAttribute(PINNED_ATTR)
      element.style.removeProperty(MARGIN_TOP_VAR)
      element.style.removeProperty(MARGIN_BOTTOM_VAR)
    }
  }
}

/** Keep the scroll distance current and look for fixed elements again whenever the page changes. */
function startPinning(): void {
  const root = document.documentElement
  const body = document.body
  const onScroll = () => root.style.setProperty(SCROLL_VAR, `${body.scrollTop}px`)
  let queued = 0
  const observer = new MutationObserver(() => {
    if (queued !== 0) return
    queued = requestAnimationFrame(() => {
      queued = 0
      pinFixedElements()
    })
  })
  onScroll()
  pinFixedElements()
  body.addEventListener('scroll', onScroll, { passive: true })
  observer.observe(body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] })
  stopPinning = () => {
    observer.disconnect()
    if (queued !== 0) cancelAnimationFrame(queued)
    body.removeEventListener('scroll', onScroll)
    root.style.removeProperty(SCROLL_VAR)
    for (const element of body.querySelectorAll<HTMLElement>(`[${PINNED_ATTR}]`)) {
      element.removeAttribute(PINNED_ATTR)
      element.style.removeProperty(MARGIN_TOP_VAR)
      element.style.removeProperty(MARGIN_BOTTOM_VAR)
    }
    stopPinning = () => {}
  }
}
