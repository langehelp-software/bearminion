import { signal } from '@preact/signals'
import { dockBottom, footerBox, pointerTarget, readStickyPin, sectionBox, type PointerHit } from '../dom.js'
import type { DocumentStore } from './document.js'

export interface Size {
  width: number
  height: number
}

/** Everything the overlay reads from the page, taken once per frame. Render works from this and never measures. */
export interface OverlayMetrics {
  viewportWidth: number
  viewportHeight: number
  /** Bottom of a sticky header, so bars slide under it rather than over it. */
  pinTop: number
  /** Bottom of the editor's dock, so bars on the page never sit under it. 0 while the sidebar is open. */
  dockBottom: number
  /** Box of each section in the draft that is in the DOM. */
  sections: ReadonlyMap<string, DOMRect>
  footer: DOMRect | null
  /** The field under the pointer, or the one being edited when the pointer is off every field. */
  field: HTMLElement | null
  fieldRect: DOMRect | null
  pointer: { x: number; y: number } | null
}

const EMPTY: OverlayMetrics = {
  viewportWidth: 0,
  viewportHeight: 0,
  pinTop: 0,
  dockBottom: 0,
  sections: new Map(),
  footer: null,
  field: null,
  fieldRect: null,
  pointer: null,
}

const TOOLBAR_DEFAULT: Size = { width: 320, height: 40 }
const FOOTER_BAR_DEFAULT: Size = { width: 120, height: 40 }

function sameSize(a: Size, b: Size): boolean {
  return Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1
}

export function createLayout(doc: DocumentStore) {
  const metrics = signal<OverlayMetrics>(EMPTY)
  /** Measured by the active section bar; every bar has the same size. */
  const toolbarSize = signal<Size>(TOOLBAR_DEFAULT)
  const footerBarSize = signal<Size>(FOOTER_BAR_DEFAULT)

  let frame: number | null = null
  let pointer: { x: number; y: number } | null = null
  let hoverField: HTMLElement | null = null
  /** Where the hovered field lives, so it can be found again after a preview swaps the page DOM. */
  let hoverKey: { section: string | null; attr: string } | null = null

  function hoveredField(): HTMLElement | null {
    if (hoverField && !hoverField.isConnected && hoverKey) {
      const scope = hoverKey.section ? document.querySelector(`[data-section-id="${CSS.escape(hoverKey.section)}"]`) : document
      const again = scope?.querySelector(`[data-field="${CSS.escape(hoverKey.attr)}"]`)
      hoverField = again instanceof HTMLElement ? again : null
    }
    if (hoverField) return hoverField
    // With the pointer off every field, the field being edited keeps its outline.
    const focused = document.activeElement?.closest('[data-field][contenteditable]')
    return focused instanceof HTMLElement ? focused : null
  }

  function measure() {
    const sections = new Map<string, DOMRect>()
    for (const section of doc.page.peek()?.sections ?? []) {
      const rect = sectionBox(section.id)
      if (rect) sections.set(section.id, rect)
    }
    const field = hoveredField()
    metrics.value = {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      pinTop: readStickyPin(),
      dockBottom: dockBottom(),
      sections,
      footer: footerBox(),
      field,
      fieldRect: field?.isConnected ? field.getBoundingClientRect() : null,
      pointer,
    }
  }

  /** Measure on the next frame. Any number of calls in one frame cost one measurement. */
  function schedule() {
    if (frame !== null) return
    frame = window.requestAnimationFrame(() => {
      frame = null
      measure()
    })
  }

  function trackPointer(x: number, y: number): PointerHit {
    pointer = { x, y }
    const hit = pointerTarget(x, y)
    if (!hit.chrome) {
      hoverField = hit.field
      hoverKey = hit.field ? { section: hit.sectionId, attr: hit.field.getAttribute('data-field') ?? '' } : null
    }
    return hit
  }

  function forgetHover() {
    hoverField = null
    hoverKey = null
  }

  function setToolbarSize(size: Size) {
    if (!sameSize(toolbarSize.peek(), size)) toolbarSize.value = size
  }

  function setFooterBarSize(size: Size) {
    if (!sameSize(footerBarSize.peek(), size)) footerBarSize.value = size
  }

  function dispose() {
    if (frame !== null) window.cancelAnimationFrame(frame)
    frame = null
  }

  return { metrics, toolbarSize, footerBarSize, schedule, trackPointer, forgetHover, setToolbarSize, setFooterBarSize, dispose }
}

export type Layout = ReturnType<typeof createLayout>
