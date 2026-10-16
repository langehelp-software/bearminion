import { getAt, isHeadingField, isImageField, isRichField, marksPathFor, type PageDraft } from '../draft.js'
import { renderMarkedHtml, type TextMark } from '../marks.js'
import { renderRichText } from '../rich-text.js'
import { richEditorOf } from './rich-editor.js'
import { stickyHeaderPin } from '../toolbar-place.js'

/** The element `mountEditor` attaches the overlay's shadow root to. */
export const EDITOR_HOST_ID = 'bearminion-editor-host'

const EDITOR_CHROME = '.bm-toolbar, .bm-popover, .bm-dialog, .bm-rich, .bm-sidebar, .bm-dock, .bm-scrim'

export function editorShadowRoot(): ShadowRoot | null {
  return document.getElementById(EDITOR_HOST_ID)?.shadowRoot ?? null
}

/** True when the event started inside the editor's own UI rather than on the page. */
export function isInEditor(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`#${EDITOR_HOST_ID}`) !== null
}

export function fieldElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  const field = target.closest('[data-field]')
  return field instanceof HTMLElement ? field : null
}

/** The emphasised word sits inside the heading field. Editing it changes the heading. */
export function editableField(target: EventTarget | null): HTMLElement | null {
  const field = fieldElement(target)
  if (!field) return null
  const path = field.getAttribute('data-field') ?? ''
  if (!path.endsWith('.em')) return field
  const parent = field.parentElement?.closest('[data-field]')
  if (!(parent instanceof HTMLElement)) return field
  const parentPath = parent.getAttribute('data-field') ?? ''
  return parentPath.endsWith('.heading') ? parent : field
}

export function fieldPathOf(element: Element): string {
  return element.getAttribute('data-field') ?? ''
}

export function sectionIdOf(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  return target.closest('[data-section-id]')?.getAttribute('data-section-id') ?? null
}

/**
 * `data-field` paths carry the section index the page was rendered with. After a move or insert the draft index differs,
 * so the path is rebuilt from the section id.
 */
export function resolvePath(element: Element, fieldPath: string, page: PageDraft | null): string {
  if (!fieldPath.startsWith('sections.') || !page) return fieldPath
  const id = element.closest('[data-section-id]')?.getAttribute('data-section-id')
  if (!id) return fieldPath
  const index = page.sections.findIndex((section) => section.id === id)
  if (index < 0) return fieldPath
  return fieldPath.replace(/^sections\.\d+/, `sections.${index}`)
}

export function textOffset(root: HTMLElement, node: Node | null, offset: number): number {
  if (!node) return 0
  try {
    const range = document.createRange()
    range.setStart(root, 0)
    range.setEnd(node, offset)
    return range.toString().length
  } catch {
    return 0
  }
}

export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'))
}

/** Replace the selection with `text` (no markup) and leave the caret after it. False when nothing is selected. */
export function insertPlainText(text: string): boolean {
  const selection = document.getSelection()
  if (!selection || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

export function isEditingText(): boolean {
  return document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable
}

/** Write the draft's text back into the page fields, for undo and restore. Images and the server-rendered rest stay. */
export function paintPage(draft: PageDraft) {
  const fields = document.querySelectorAll('main#content [data-field]')
  for (const node of fields) {
    if (!(node instanceof HTMLElement)) continue
    if (node.querySelector('img, picture, video, svg')) continue
    const raw = fieldPathOf(node)
    // An image slot's field is its alt text, but the slot's markup (frame, placeholder label) is the theme's to render.
    if (!raw.startsWith('sections.') || isImageField(raw)) continue
    const path = resolvePath(node, raw, draft)
    const value = getAt(draft, path)
    if (typeof value !== 'string') continue
    const parent = node.parentElement?.closest('[data-field]')
    if (parent instanceof HTMLElement && parent.closest('main#content')) {
      const parentValue = getAt(draft, resolvePath(parent, fieldPathOf(parent), draft))
      if (typeof parentValue === 'string' && !parent.querySelector('img, picture, video, svg')) continue
    }
    if (isRichField(raw, node.getAttribute('data-field-kind'))) {
      // A field being edited keeps its editor; replacing its markup would orphan the view.
      const editing = richEditorOf(node)
      if (editing) editing.setMarkdown(value)
      else node.innerHTML = renderRichText(value)
    } else if (isHeadingField(path)) {
      node.innerHTML = renderMarkedHtml(value, marksAt(draft, path))
    } else {
      node.textContent = value
    }
  }
}

export function marksAt(doc: unknown, path: string): TextMark[] | undefined {
  const marks = getAt(doc, marksPathFor(path) ?? '')
  return Array.isArray(marks) ? (marks as TextMark[]) : undefined
}

export function sectionBox(id: string): DOMRect | null {
  return document.querySelector(`[data-section-id="${CSS.escape(id)}"]`)?.getBoundingClientRect() ?? null
}

export function footerBox(): DOMRect | null {
  return document.querySelector('[data-organism="footer"]')?.getBoundingClientRect() ?? null
}

/** Bottom of the closed editor's dock (the pill, Save and the open button), or 0 while the sidebar replaces it. */
export function dockBottom(): number {
  return editorShadowRoot()?.querySelector('.bm-dock')?.getBoundingClientRect().bottom ?? 0
}

export function readStickyPin(): number {
  const header = document.querySelector('[data-organism="header"]')
  if (!(header instanceof HTMLElement)) return 0
  const rect = header.getBoundingClientRect()
  return stickyHeaderPin({ position: getComputedStyle(header).position, top: rect.top, bottom: rect.bottom })
}

export interface PointerHit {
  sectionId: string | null
  field: HTMLElement | null
  /** The pointer is over the editor's own UI. */
  chrome: boolean
}

export function pointerTarget(x: number, y: number): PointerHit {
  const host = document.getElementById(EDITOR_HOST_ID)
  const top = document.elementFromPoint(x, y)
  const root = top?.getRootNode()
  const inner =
    host && top && (top === host || host.contains(top) || root === host.shadowRoot) ? (host.shadowRoot?.elementFromPoint(x, y) ?? top) : top
  if (inner instanceof Element && inner.closest(EDITOR_CHROME)) {
    return { sectionId: null, field: null, chrome: true }
  }
  if (!(inner instanceof Element)) return { sectionId: null, field: null, chrome: false }
  const field = inner.closest('[data-field]')
  return {
    sectionId: inner.closest('[data-section-id]')?.getAttribute('data-section-id') ?? null,
    field: field instanceof HTMLElement ? field : null,
    chrome: false,
  }
}

/** Replace one server-rendered organism (header, footer) with fresh markup. */
export function swapOrganism(organism: 'header' | 'footer', html: string) {
  const template = document.createElement('template')
  template.innerHTML = html
  const next = template.content.querySelector(`[data-organism="${organism}"]`)
  const old = document.querySelector(`[data-organism="${organism}"]`)
  if (next && old) old.replaceWith(next)
}

/** Tells the page's own scripts (reveal animations, carousels) that fresh preview markup is in. */
export function announcePreview() {
  document.dispatchEvent(new CustomEvent('bearminion:preview'))
}
