import { batch, effect } from '@preact/signals'
import { getAt, imageObjectPath, isHeadingField, isImageField, isMultilineField, isRichField } from '../../draft.js'
import { richLinkAt } from '../../rich-text.js'
import { editableField, fieldPathOf, insertPlainText, isInEditor, resolvePath, sectionIdOf, textOffset } from '../dom.js'
import { mountRichEditor, richEditorOf } from '../rich-editor.js'
import { isLinkRecord } from '../shared.js'
import { isPagePath } from '../state/document.js'
import type { Editor } from '../state/editor.js'
import type { Dispose } from './reactions.js'

function isRich(field: HTMLElement, path = fieldPathOf(field)): boolean {
  return isRichField(path, field.getAttribute('data-field-kind'))
}

/**
 * Editing directly on the page: a click makes a field editable (or opens the image picker or the link popover),
 * typing and pasting write to the draft, and selecting heading text brings up the format bar.
 * Every handler stands down in preview mode.
 */
export function attachPageEditing(editor: Editor): Dispose {
  const { doc, ui, edits, links, layout } = editor
  const active = () => !ui.previewing.peek()
  const pathOf = (field: HTMLElement, raw = fieldPathOf(field)) => resolvePath(field, raw, doc.page.peek())

  /**
   * Give a rich field its own editor. The draft's markdown is the source: the editor follows later changes to it
   * (a link edited in the popover, an undo) and writes its own, so the two never drift apart.
   */
  function startRich(field: HTMLElement, selection?: { anchor: number; head: number }) {
    const existing = richEditorOf(field)
    if (existing) {
      editor.richTarget.current = existing
      return
    }
    const read = () => {
      const resolved = pathOf(field)
      const value = getAt(isPagePath(resolved) ? doc.page.value : doc.site.value, resolved)
      return typeof value === 'string' ? value : ''
    }
    let stop: Dispose = () => {}
    const handle = mountRichEditor(field, {
      markdown: read(),
      headings: field.getAttribute('data-rich-headings') === 'true',
      selection,
      onChange: (markdown) => edits.writeField(pathOf(field), markdown),
      keepsEdit: isInEditor,
      onActive: (active) => {
        ui.richActive.value = active
      },
      onDestroy: () => {
        stop()
        if (editor.richTarget.current?.field !== field) return
        batch(() => {
          editor.richTarget.current = null
          ui.rich.value = null
          ui.richActive.value = null
        })
      },
    })
    stop = effect(() => handle.setMarkdown(read()))
    editor.richTarget.current = handle
  }

  /** Where the caret or selection sits in `field`'s own markup, as character offsets, so the editor can pick it up. */
  function selectionIn(field: HTMLElement): { anchor: number; head: number } | undefined {
    const selection = document.getSelection()
    const { anchorNode, focusNode } = selection ?? {}
    if (!selection || !anchorNode || !focusNode || !field.contains(anchorNode) || !field.contains(focusNode)) return undefined
    return { anchor: textOffset(field, anchorNode, selection.anchorOffset), head: textOffset(field, focusNode, selection.focusOffset) }
  }

  const onPointerDown = (event: PointerEvent) => {
    if (!active()) return
    const field = editableField(event.target)
    // A click anywhere else on the page ends the edit at once. Clicks in the editor's own panels keep it,
    // because the formatting bar acts on the field's selection.
    const focused = document.activeElement
    if (
      focused instanceof HTMLElement &&
      focused !== field &&
      !isInEditor(event.target) &&
      focused.matches('[data-field][contenteditable]')
    ) {
      focused.blur()
      // A rich field that never got its editor (no click followed) must not stay typeable without one.
      if (isRich(focused) && !richEditorOf(focused)) focused.removeAttribute('contenteditable')
      layout.forgetHover()
    }
    // Clicking away from a field being edited ends the edit, even when focus had moved to the formatting bar.
    const editing = editor.richTarget.current
    if (editing && editing.field !== field && !isInEditor(event.target)) editing.destroy()
    if (!field) return
    const path = fieldPathOf(field)
    if (isImageField(path) || path.endsWith('.label')) return
    // The browser places the caret in the page's own markup; the click that follows hands it to the field's editor.
    field.setAttribute('contenteditable', 'true')
  }

  /** A button or nav link label opens the link popover instead of becoming editable. */
  function openLabelLink(field: HTMLElement, resolved: string): boolean {
    const objectPath = resolved.replace(/\.label$/, '')
    const value = getAt(doc.docFor(objectPath), objectPath)
    if (!isLinkRecord(value)) return false
    links.open(objectPath, value, field.getBoundingClientRect())
    return true
  }

  /** A link inside rich text opens the link popover on that link. */
  function openRichLink(field: HTMLElement, resolved: string, target: EventTarget | null): boolean {
    const clicked = target instanceof Element ? target.closest('a') : null
    if (!(clicked instanceof HTMLAnchorElement) || !field.contains(clicked)) return false
    const index = [...field.querySelectorAll('a')].indexOf(clicked)
    const markdown = getAt(doc.docFor(resolved), resolved)
    const span = typeof markdown === 'string' ? richLinkAt(markdown, index) : null
    if (!span) return false
    links.openRich(resolved, index, span, clicked.getBoundingClientRect())
    return true
  }

  const onClick = (event: MouseEvent) => {
    if (!active()) return
    const field = editableField(event.target)
    if (!field) {
      if (isInEditor(event.target)) return
      const id = sectionIdOf(event.target)
      batch(() => {
        if (id) ui.selectSection(id)
        ui.rich.value = null
      })
      return
    }
    event.preventDefault()
    const path = fieldPathOf(field)
    const id = sectionIdOf(field)
    if (id) ui.selectSection(id)
    const resolved = pathOf(field, path)
    if (isImageField(path)) {
      // The picker opens over the page. The sidebar stays as it is.
      ui.pagePick.value = imageObjectPath(resolved)
      return
    }
    if (path.endsWith('.label') && openLabelLink(field, resolved)) return
    const richField = isRich(field, path)
    if (richField && openRichLink(field, resolved, event.target)) return
    if (richField) {
      startRich(field, selectionIn(field))
      const rect = field.getBoundingClientRect()
      ui.rich.value = { top: rect.bottom + 8, left: rect.left }
    } else {
      field.setAttribute('contenteditable', isHeadingField(resolved) ? 'true' : 'plaintext-only')
      editor.richTarget.current = null
      ui.rich.value = null
    }
  }

  /** Selected heading text (or site name) gets the weight and font bar above it. */
  const onSelect = () => {
    if (!active()) return
    ui.headingBar.value = headingSelection()
  }

  function headingSelection() {
    const selection = document.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
    const anchorNode = selection.anchorNode
    const element = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement
    const field = element?.closest('[data-field]')
    if (!(field instanceof HTMLElement) || !selection.focusNode || !field.contains(selection.focusNode)) return null
    const path = pathOf(field)
    if (!isHeadingField(path)) return null
    const start = textOffset(field, selection.anchorNode, selection.anchorOffset)
    const end = textOffset(field, selection.focusNode, selection.focusOffset)
    const from = Math.min(start, end)
    const to = Math.max(start, end)
    if (to <= from) return null
    const rect = selection.getRangeAt(0).getBoundingClientRect()
    // The bar is 56px tall, so it sits 64px above the selection.
    return { top: Math.max(8, rect.top - 64), left: Math.max(8, rect.left), path, start: from, end: to }
  }

  const onInput = (event: Event) => {
    if (!active()) return
    const field = editableField(event.target)
    // A rich field's editor writes its own changes.
    if (!field || isRich(field)) return
    edits.writeField(pathOf(field), field.innerText)
  }

  /**
   * Heading text pastes as plain text. Rich fields sanitize their own paste in their editor, and plain-text-only
   * fields already paste as plain text in the browser.
   */
  const onPaste = (event: ClipboardEvent) => {
    if (!active()) return
    const field = editableField(event.target)
    if (!field?.isContentEditable || isRich(field) || field.contentEditable === 'plaintext-only') return
    event.preventDefault()
    const text = (event.clipboardData?.getData('text/plain') ?? '').replace(/\s*\r?\n\s*/g, ' ')
    if (insertPlainText(text)) field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }))
  }

  /** Enter ends the edit in single-line fields. A rich field's editor handles its own Enter. */
  const onEnter = (event: KeyboardEvent) => {
    if (!active() || event.key !== 'Enter' || event.shiftKey) return
    const field = editableField(event.target)
    if (!field?.isContentEditable) return
    const path = fieldPathOf(field)
    if (isRich(field, path)) return
    if (!isMultilineField(path)) {
      event.preventDefault()
      field.blur()
      ui.rich.value = null
    }
  }

  const listeners = [
    ['pointerdown', onPointerDown],
    ['click', onClick],
    ['input', onInput],
    ['paste', onPaste],
    ['keydown', onEnter],
    ['mouseup', onSelect],
    ['keyup', onSelect],
  ] as const
  for (const [type, listener] of listeners) document.addEventListener(type, listener as EventListener, true)
  return () => {
    for (const [type, listener] of listeners) document.removeEventListener(type, listener as EventListener, true)
  }
}
