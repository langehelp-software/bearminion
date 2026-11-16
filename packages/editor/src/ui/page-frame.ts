import type { CanvasRect } from '../shell.js'

const FRAME_STYLE_ID = 'bearminion-shell-frame'
/** On `<html>` while the page is framed inside the editor shell. */
export const FRAMED_ATTR = 'data-bearminion-shell'

/**
 * The page's own CSS while it sits in the canvas. `<body>` becomes the scroll container at the canvas rectangle, and
 * its transform makes it the containing block of the site's `position: fixed` elements, so a fixed header or cookie bar
 * stays inside the canvas and a sticky header sticks to the canvas top. Sizes the site set on `<body>` are overridden.
 */
export function frameCss(rect: CanvasRect): string {
  const body = `html[${FRAMED_ATTR}] > body`
  return [
    `html[${FRAMED_ATTR}] { overflow: hidden !important; }`,
    // A site locks scrolling on <html> behind a modal (a lightbox); in the frame it is <body> that scrolls.
    `html[${FRAMED_ATTR}]:has(dialog:modal) > body { overflow: hidden !important; }`,
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
}
