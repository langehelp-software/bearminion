import { computed } from '@preact/signals'
import { getAt, imageObjectPath, isImageField, type SectionDraft } from '../../draft.js'
import { placeSectionToolbar } from '../../toolbar-place.js'
import { resolvePath } from '../dom.js'
import { IMAGE_BAR_MIN_HEIGHT, IMAGE_BAR_MIN_WIDTH } from '../image-bar.js'
import { isImageRecord } from '../shared.js'
import type { DocumentStore } from './document.js'
import type { Layout, OverlayMetrics, Size } from './layout.js'
import type { InsertWhere, UiState } from './ui.js'

/** Section bars scroll away with their section, inset from its top-left corner. Set to true to pin them under the page header. */
const TOOLBAR_STICKY = false
const TOOLBAR_INSET = 8
/** How close the pointer must be to a seam between sections for the insert bar to show. */
const GAP_ZONE = 16
/** The image bar hides when the image is this close to the top or bottom of the viewport. */
const IMAGE_BAR_EDGE = 56

export type BarPlacement = ReturnType<typeof placeSectionToolbar>

/**
 * Top of the image bar: 8px inside the image, but never above `floor` (below the dock and a sticky header), where
 * the dock would cover its buttons. Null when the visible part of the image is too short to hold the bar there.
 */
export function imageBarTop(rect: Pick<DOMRect, 'top' | 'bottom'>, floor: number): number | null {
  const top = Math.max(rect.top + 8, floor)
  return top <= rect.bottom - 48 ? top : null
}

/** A place a section can be inserted: above the first, between two, below the last. */
export interface Seam {
  y: number
  left: number
  right: number
  id: string
  where: InsertWhere
}

export interface ImageBarModel {
  field: HTMLElement
  path: string
  value: { src: string; alt?: string; fit?: unknown; position?: unknown }
  top: number
  right: number
}

export function placeBar(rect: DOMRect, size: Size, metrics: OverlayMetrics, contentRight: number): BarPlacement {
  return placeSectionToolbar({
    sectionTop: rect.top,
    sectionBottom: rect.bottom,
    sectionLeft: rect.left,
    toolbarWidth: size.width,
    toolbarHeight: size.height,
    pinTop: metrics.pinTop,
    viewportHeight: metrics.viewportHeight,
    contentRight,
    sticky: TOOLBAR_STICKY,
    inset: TOOLBAR_INSET,
  })
}

/** Every seam that is on screen. Between two sections the seam sits halfway across the gap. */
export function findSeams(sections: readonly SectionDraft[], metrics: OverlayMetrics, contentRight: number): Seam[] {
  const found: Seam[] = []
  const add = (y: number, rect: DOMRect, id: string, where: InsertWhere) => {
    if (y < 8 || y > metrics.viewportHeight - 8) return
    found.push({ y, left: Math.max(rect.left, 0), right: Math.min(rect.right, contentRight), id, where })
  }
  sections.forEach((section, index) => {
    const rect = metrics.sections.get(section.id)
    if (!rect) return
    if (index === 0) add(rect.top, rect, section.id, 'above')
    const next = sections[index + 1]
    const nextRect = next ? metrics.sections.get(next.id) : undefined
    if (nextRect) add((rect.bottom + nextRect.top) / 2, rect, section.id, 'below')
    else add(rect.bottom, rect, section.id, 'below')
  })
  return found
}

export function nearestSeam(seams: readonly Seam[], pointer: { x: number; y: number }, contentRight: number): Seam | null {
  if (pointer.x > contentRight) return null
  let best: Seam | null = null
  for (const seam of seams) {
    const distance = Math.abs(pointer.y - seam.y)
    if (distance <= GAP_ZONE && (best === null || distance < Math.abs(pointer.y - best.y))) best = seam
  }
  return best
}

/** "between Hero and Logo strip", "before Hero" at the top, "after Contact" at the bottom. */
export function seamName(sections: readonly SectionDraft[], labels: Record<string, string>, id: string, where: InsertWhere): string {
  const index = sections.findIndex((section) => section.id === id)
  if (index < 0) return ''
  const name = (section: SectionDraft | undefined) => (section ? (labels[section.type] ?? section.type) : '')
  const previous = name(sections[where === 'above' ? index - 1 : index])
  const next = name(sections[where === 'above' ? index : index + 1])
  if (previous && next) return `between ${previous} and ${next}`
  if (next) return `before ${next}`
  if (previous) return `after ${previous}`
  return ''
}

/** Where every overlay element goes, derived from the measured page and the editor state. Nothing here reads the DOM. */
export function createOverlayModel(doc: DocumentStore, ui: UiState, layout: Layout) {
  const { metrics } = layout
  /** Right edge of the page area the sidebar leaves uncovered. */
  const contentRight = computed(() => metrics.value.viewportWidth - (ui.open.value ? ui.sidebarWidth.value : 0))

  const known = (id: string | null) => (id && doc.page.value?.sections.some((section) => section.id === id) ? id : null)
  const activeHover = computed(() => known(ui.hoverId.value))
  /** The section whose bar is active: the one a popover is about, else the hovered one, else the selected one. */
  const toolbarId = computed(
    () => ui.addMenu.value ?? ui.picker.value?.id ?? ui.confirm.value?.id ?? activeHover.value ?? known(ui.selectedId.value),
  )
  const toolbarPlace = computed(() => {
    const id = toolbarId.value
    const rect = id ? metrics.value.sections.get(id) : undefined
    return rect ? placeBar(rect, layout.toolbarSize.value, metrics.value, contentRight.value) : null
  })
  const toolbarVisible = computed(() => Boolean(toolbarPlace.value?.visible && toolbarId.value && doc.page.value))

  /** Every section keeps its own bar in view. The active one goes first so it stays the first toolbar in the DOM. */
  const toolbars = computed(() => {
    const active = toolbarId.value
    return (doc.page.value?.sections ?? [])
      .flatMap((section) => {
        const rect = metrics.value.sections.get(section.id)
        const placement = rect ? placeBar(rect, layout.toolbarSize.value, metrics.value, contentRight.value) : null
        return placement?.visible ? [{ section, placement, active: section.id === active }] : []
      })
      .sort((x, y) => Number(y.active) - Number(x.active))
  })

  /** The footer is not a section, so it gets its own small bar. */
  const footerPlace = computed(() => {
    const rect = metrics.value.footer
    return rect ? placeBar(rect, layout.footerBarSize.value, metrics.value, contentRight.value) : null
  })

  const hoverRect = computed(() => (activeHover.value ? (metrics.value.sections.get(activeHover.value) ?? null) : null))

  const seams = computed(() => {
    const page = doc.page.value
    if (!page || !doc.catalog.value) return []
    return findSeams(page.sections, metrics.value, contentRight.value)
  })

  /** The insert bar under the pointer. Hidden while any popover over the page is up. */
  const gapBar = computed(() => {
    const pointer = metrics.value.pointer
    if (!pointer || ui.addMenu.value || ui.picker.value || ui.confirm.value || ui.linkEdit.value || ui.pagePick.value) return null
    return nearestSeam(seams.value, pointer, contentRight.value)
  })

  /** While the picker opened from a seam is up, the line stays and a chip says where the new section goes. */
  const openGap = computed(() => {
    const picker = ui.picker.value
    if (!picker?.fromGap) return null
    return seams.value.find((seam) => seam.id === picker.id && seam.where === picker.where) ?? null
  })

  const pickerWhere = computed(() => {
    const picker = ui.picker.value
    const page = doc.page.value
    if (!picker || !page) return ''
    return seamName(page.sections, doc.catalog.value?.sectionLabels ?? {}, picker.id, picker.where)
  })

  /** The field under the pointer, and its fit and position bar when it is a large enough section image. */
  const field = computed(() => {
    const { field: node, fieldRect: rect, viewportHeight, viewportWidth, pinTop, dockBottom } = metrics.value
    if (!node || !rect) return null
    const attr = node.getAttribute('data-field') ?? ''
    const image = isImageField(attr)
    const path = image ? imageObjectPath(resolvePath(node, attr, doc.page.value)) : ''
    // Logos sit in their own frame, so fit and position do not apply to them.
    const value = path.startsWith('sections.') && !/(^|\.)logos\./.test(path) ? getAt(doc.page.value, path) : undefined
    const barTop = imageBarTop(rect, Math.max(8, pinTop + 8, dockBottom + 8))
    const bar: ImageBarModel | null =
      barTop !== null &&
      isImageRecord(value) &&
      value.src !== '' &&
      value.src !== 'placeholder' &&
      rect.width >= IMAGE_BAR_MIN_WIDTH &&
      rect.height >= IMAGE_BAR_MIN_HEIGHT &&
      rect.bottom > IMAGE_BAR_EDGE &&
      rect.top < viewportHeight - IMAGE_BAR_EDGE
        ? {
            field: node,
            path,
            value,
            top: barTop,
            right: viewportWidth - Math.min(rect.right, contentRight.value) + 8,
          }
        : null
    return { node, rect, image, bar }
  })

  return {
    contentRight,
    activeHover,
    toolbarId,
    toolbarPlace,
    toolbarVisible,
    toolbars,
    footerPlace,
    hoverRect,
    seams,
    gapBar,
    openGap,
    pickerWhere,
    field,
  }
}

export type OverlayModel = ReturnType<typeof createOverlayModel>
